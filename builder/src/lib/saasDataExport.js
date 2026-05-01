// SaaS Data export — replicates the Excel produced by SaasAnalyticsSrv's
// /api/getinvoicestoexcel endpoint, populated from BigQuery.
//
// Mapping rules and rationale are documented in
// /docs/saas-data-export-mapping.md (root of repo). Read that BEFORE editing.
//
// Verified against published April 2026 file:
//   - DiscountOtherPortion = SaaS-Other discounts + ALL PSDiscount  (file conflates them)
//   - PSIncomeAmount       = TLF.PSBeforeDiscount  (gross, NOT TLF.PSAmount which is net)
//   - PackPaidCount/UserPaidCount must be MAX-per-invoice, then summed across invoices
//   - CustomerGrouping is period-relative — derived in JS, not from BQ's BOM/EOM columns
//
// Smell-test caveats (flag for users): see audit doc §"Things in the API logic
// that don't pass the smell test". The numbers match the official report by
// design; that includes inheriting some weird API classifications (Portals
// counted as Classic, Prepay Expiry counted as New, etc.).

import ExcelJS from 'exceljs';
import { queryBq } from './bigquery.js';

// ---------------------------------------------------------------------------
// CustomerGrouping — exact port of CommonService.GetEOM/BOMCustomerGrouping
// and FinalizeTxn in the C# API. Period-relative.
// ---------------------------------------------------------------------------

function parseDate(v) {
  if (v == null || v === '' || v === '0' || v === 0) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Per-invoice CustomerGrouping. Mirrors GetInvoicesService.cs:508-590.
// `account` must contain: FirstSaaSInvoiceTxnDate, CancellationDate, IsActive.
export function customerGroupingForInvoice(account, fromDateUTC, toDateUTC) {
  if (!account) return 'unknown';
  const firstInvoice = parseDate(account.FirstSaaSInvoiceTxnDate);
  const cancel = parseDate(account.CancellationDate);
  const isActive = String(account.IsActive ?? '').toLowerCase();

  // Start state: was this account already a paying customer at FromDate?
  const startState = (!firstInvoice || firstInvoice > fromDateUTC) ? 'Trialer' : 'Customer';

  let endState, cancelState;
  if (isActive === 'unknown') return 'unknown';
  if (isActive === 'true' || (cancel && cancel > toDateUTC)) {
    // Left the period still active.
    endState = (firstInvoice && firstInvoice <= toDateUTC) ? 'Customer' : 'Trialer';
    cancelState = 'N/A';
  } else {
    // Left the period cancelled.
    endState = 'Cancelled';
    cancelState = (cancel && firstInvoice && cancel >= firstInvoice) ? 'Customer' : 'Trialer';
  }

  if (startState === 'Customer' && endState === 'Customer') return 'ExistingCustomerEOM';
  if (startState === 'Trialer' && endState === 'Customer') return 'NewCustomerEOM';
  if (startState === 'Trialer' && endState === 'Trialer') return 'TrialerEOM';
  if (startState === 'Customer' && endState === 'Cancelled') return 'ExistingCustChurn';
  if (startState === 'Trialer' && endState === 'Cancelled' && cancelState === 'Customer') return 'NewCustChurn';
  if (startState === 'Trialer' && endState === 'Cancelled' && cancelState === 'Trialer') return 'TrialerCancelled';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// IsPartnerManaged — sourced flag in the API. Hardcoded list until synced.
// Verified against April 2026: only Mobility City Franchises was True.
// ---------------------------------------------------------------------------
const PARTNER_MANAGED_SET = new Set([
  'Mobility City Franchises',
]);

// ---------------------------------------------------------------------------
// BigQuery extraction
// ---------------------------------------------------------------------------

function bqDateLiteral(d) {
  // TLF.TxnDate, Account.SignUpDate, Account.CancellationDate are DATE columns,
  // so emit a DATE literal — TIMESTAMP literals fail with "No matching signature
  // for operator >= for argument types: DATE, TIMESTAMP".
  const ymd = d.toISOString().slice(0, 10);
  return `DATE '${ymd}'`;
}

// Aggregate Invoices/CreditMemos at TxnRecordID level.
async function fetchTxns(txnType, fromDate, toDate) {
  const sql = `
    WITH agg AS (
      SELECT
        TransRecordID,
        ANY_VALUE(CompanyAccount)                                    AS CompanyAccount,
        ANY_VALUE(TxnDate)                                           AS TxnDate,
        ANY_VALUE(InvoiceGrouping)                                   AS InvoiceGrouping,
        ANY_VALUE(PlatformToggle)                                    AS PlatformToggle,
        ANY_VALUE(SaaSPayType)                                       AS SaaSPayType,
        SUM(IF(PlatformToggle='Classic', SaaSAmount, 0))             AS SaaSIncomeAmountClassic,
        SUM(IF(PlatformToggle='New',     SaaSAmount, 0))             AS SaaSIncomeAmountNew,
        SUM(SaaSExpense)                                             AS SaasExpense,
        SUM(PSBeforeDiscount)                                        AS PSIncomeAmount,
        SUM(PSExpense)                                               AS PSExpenseAmount,
        SUM(LiabilityPortion)                                        AS LiabilityPortion,
        SUM(IF(SaaSDiscountType='Prepay', SaaSDiscount, 0))          AS DiscountPrepayPortion,
        SUM(IF(SaaSDiscountType='Other',  SaaSDiscount, 0)) + SUM(PSDiscount) AS DiscountOtherPortion,
        0                                                            AS UncategorizedPortion,
        MAX(PackPaidCount)                                           AS PackPaidCount,
        MAX(UserPaidCount)                                           AS UserPaidCount,
        ANY_VALUE(SalesRep)                                          AS Rep,
        -- Currency in the published file is the AR-account name on the QB
        -- invoice header (only ever 'US-Accounts Receivable' or
        -- 'CAN-Accounts Receivable'). That value isn't in TLF (which has
        -- only Income/Expense/Liability lines, never the AR side), so we
        -- approximate from SyncTypeRegion: CA → CAN, everything else → US.
        IF(ANY_VALUE(SyncTypeRegion) = 'CA', 'CAN-Accounts Receivable', 'US-Accounts Receivable') AS Currency
      FROM \`project-for-method-dw.revenue.TransLineFlattened\`
      WHERE TxnType = '${txnType}'
        AND TxnDate >= ${bqDateLiteral(fromDate)}
        AND TxnDate <  ${bqDateLiteral(toDate)}
      GROUP BY TransRecordID
    )
    SELECT * FROM agg
    ORDER BY TxnDate, TransRecordID
  `;
  const { rows } = await queryBq(sql);
  return rows;
}

// One row per CompanyAccount, with all per-period dollar aggregates and the
// static account fields. Pack/User counts use MAX-per-invoice then SUM-across.
async function fetchAccounts(fromDate, toDate) {
  const sql = `
    WITH per_invoice AS (
      SELECT
        CompanyAccount,
        TransRecordID,
        MAX(PackPaidCount) AS pack_max,
        MAX(UserPaidCount) AS user_max
      FROM \`project-for-method-dw.revenue.TransLineFlattened\`
      WHERE TxnDate >= ${bqDateLiteral(fromDate)}
        AND TxnDate <  ${bqDateLiteral(toDate)}
        AND TxnType = 'Invoice'
      GROUP BY CompanyAccount, TransRecordID
    ),
    pack_user AS (
      SELECT CompanyAccount,
             SUM(pack_max) AS PackPaidCount,
             SUM(user_max) AS UserPaidCount
      FROM per_invoice
      GROUP BY CompanyAccount
    ),
    period_agg AS (
      SELECT
        CompanyAccount,
        SUM(SaaSAmount)                                              AS SaaSIncomeAmount,
        SUM(SaaSExpense)                                             AS SaasExpense,
        SUM(PSBeforeDiscount)                                        AS PSIncomeAmount,
        SUM(PSExpense)                                               AS PSExpenseAmount,
        SUM(LiabilityPortion)                                        AS LiabilityPortion,
        COUNT(DISTINCT IF(InvoiceGrouping='SaaS' AND TxnType='Invoice', TransRecordID, NULL)) AS SaaSInvoiceCount,
        ANY_VALUE(SaaSPayType)                                       AS SaaSPayTypePeriod,
        ANY_VALUE(SyncType)                                          AS SyncType,
        ANY_VALUE(Channel)                                           AS Channel,
        ANY_VALUE(Platform)                                          AS Platform,
        ANY_VALUE(BOMCustomerGrouping)                               AS BOMCustomerGrouping,
        ANY_VALUE(EOMCustomerGrouping)                               AS EOMCustomerGrouping,
        ANY_VALUE(AgeAtBOM)                                          AS AgeAtBOM,
        MAX(SalesRep)                                                AS MethodRep,
        ANY_VALUE(Offering)                                          AS Offering
      FROM \`project-for-method-dw.revenue.TransLineFlattened\`
      WHERE TxnDate >= ${bqDateLiteral(fromDate)}
        AND TxnDate <  ${bqDateLiteral(toDate)}
      GROUP BY CompanyAccount
    )
    SELECT
      a.CompanyAccount,
      pa.BOMCustomerGrouping, pa.EOMCustomerGrouping,
      pa.SaaSPayTypePeriod, pa.SyncType, pa.Channel, pa.Platform, pa.AgeAtBOM,
      pa.SaaSIncomeAmount, pa.SaasExpense, pa.SaaSInvoiceCount,
      pu.PackPaidCount, pu.UserPaidCount,
      pa.PSIncomeAmount, pa.PSExpenseAmount, pa.LiabilityPortion,
      a.Partner,
      a.IsActive, a.SignUpDate AS MethodSignUpDate,
      a.FirstSaaSInvoiceTxnDate, a.CancellationDate AS MethodCancellationDate,
      pa.MethodRep, a.Offering,
      a.Att_Direct, a.Att_SEO, a.Att_OPN_Other_Peoples_Networks,
      a.Att_Pay_Per_Click, a.Att_Partners, a.Att_Email,
      a.Att_Remarketing, a.Att_Social, a.Att_Help_Center,
      a.Att_Online_Chat_Tool, a.Att_Content, a.Att_Banner_Ads,
      a.Att_Seminar_Conference, a.Att_Referral_Program,
      a.Att_Referral_Link, a.Att_Backlinks, a.Att_Other, a.Att_None,
      a.SyncTypeRegion, a.Vertical, a.Sector, a.CustDatIndustry,
      a.CustDatFirstSyncCompleted, a.CustDatLastRefreshed,
      a.CustDatCountOfEmployees, a.CustDatAnnualSales,
      a.CustDatCountOfCustomers, a.LicenseCount,
      a.CountOfCustomScreens, a.CountOfCustomScreensMN,
      a.IsConversionException, a.IsChurnException,
      a.Custdatlastsaasamount, a.Custdatpreviouslastsaasamount,
      a.SaaSPayType AS SaaSPayTypeCurrent
    FROM \`project-for-method-dw.revenue.Account\` a
    LEFT JOIN period_agg pa USING (CompanyAccount)
    LEFT JOIN pack_user  pu USING (CompanyAccount)
    -- include accounts with activity in period OR alive at any boundary
    WHERE pa.CompanyAccount IS NOT NULL
       OR (a.SignUpDate < ${bqDateLiteral(toDate)}
           AND (a.CancellationDate IS NULL OR a.CancellationDate >= ${bqDateLiteral(fromDate)}))
  `;
  const { rows } = await queryBq(sql);
  return rows;
}

// ---------------------------------------------------------------------------
// Excel population
// ---------------------------------------------------------------------------

// 22-col schema for Invoices/CreditMemos. Order MUST match the API output
// because the formula tabs reference these cells by absolute position.
const TXN_HEADER = [
  'TxnRecordID','CompanyAccount','TxnDate','RefNumber','CustomerGrouping',
  'InvoiceGrouping','PlatformToggle','SaaSPayType',
  'SaaSIncomeAmountClassic','SaaSIncomeAmountNew','SaasExpense',
  'PSIncomeAmount','PSExpenseAmount','LiabilityPortion',
  'DiscountPrepayPortion','DiscountOtherPortion','UncategorizedPortion',
  'IsNewCustomerSaaS','Paid Packs','Paid Users','Rep','Currency',
];

// 62-col schema for Accounts.
const ACCOUNT_HEADER = [
  'CompanyAccount','BOMCustomerGrouping','EOMCustomerGrouping','SaaSPayType',
  'SyncType','Channel','Platform','AgeAtBOM','SaaSIncomeAmount','SaasExpense',
  'SaaSInvoiceCount','PackPaidCount','UserPaidCount','PSIncomeAmount',
  'PSExpenseAmount','LiabilityPortion','Partner','IsPartnerManaged','IsActive',
  'MethodSignUpDate','FirstSaaSInvoiceTxnDate','MethodCancellationDate',
  'IsNewPayer','MethodRep','Offering',
  'Att_Direct','Att_SEO','Att_OPN_Other_Peoples_Networks','Att_Pay_Per_Click',
  'Att_Partners','Att_Email','Att_Remarketing','Att_Social','Att_Help_Center',
  'Att_Online_Chat_Tool','Att_Content','Att_Banner_Ads','Att_Seminar_Conference',
  'Att_Referral_Program','Att_Referral_Link','Att_Backlinks','Att_Other','Att_None',
  'SyncTypeRegion','Vertical','Sector','CustDatIndustry',
  'CustDatFirstSyncCompleted','CustDatLastRefreshed','CustDatCountOfEmployees',
  'CustDatAnnualSales','CustDatCountOfCustomers','LicenseCount',
  'CountOfCustomScreens','CountOfCustomScreensMN','FromDateFilter','ToDateFilter',
  'ConversionException','ChurnException','Custdatlastsaasamount',
  'Custdatpreviouslastsaasamount','SaaSPayTypeCurrent',
];

// Mirror the API's Excel formula at column 18 (1-indexed): IsNewCustomerSaaS.
// (The column-letter encoding assumes the standard 22-col layout above.)
function isNewCustomerSaaSFormula(rowIdx /* 1-indexed Excel row */) {
  // E = CustomerGrouping (col 5), F = InvoiceGrouping (col 6)
  return `=IF(F${rowIdx}="SaaS",IF(E${rowIdx}="NewCustomerEOM",1,0),0)`;
}

// Mirror the API's Excel formula at Accounts col 23 (1-indexed): IsNewPayer.
// API: "=IF(IF(B{r}=\"none\",1,IF(B{r}=\"Trialer\",1,0))+IF(C{r}=\"Customer\",1,IF(C{r}=\"Lost\",1,0))=2,1,0)"
function isNewPayerFormula(rowIdx) {
  const r = rowIdx;
  return `=IF(IF(B${r}="none",1,IF(B${r}="Trialer",1,0))+IF(C${r}="Customer",1,IF(C${r}="Lost",1,0))=2,1,0)`;
}

function clearDataRows(sheet) {
  // Remove every row below the header so we don't end up with leftover rows
  // from the template if it ships with sample data.
  if (sheet.rowCount > 1) {
    sheet.spliceRows(2, sheet.rowCount - 1);
  }
}

function writeTxnSheet(sheet, txnRows, accountByCA, fromDateUTC, toDateUTC) {
  clearDataRows(sheet);
  let excelRow = 2; // row 1 is the header
  for (const r of txnRows) {
    const acct = accountByCA.get(r.CompanyAccount);
    const cg = customerGroupingForInvoice(acct, fromDateUTC, toDateUTC);
    const txnDate = r.TxnDate ? new Date(r.TxnDate) : null;
    const row = [
      Number(r.TransRecordID),
      r.CompanyAccount ?? '',
      txnDate,
      '',                              // RefNumber — gap, left blank
      cg,
      r.InvoiceGrouping ?? '',
      r.PlatformToggle ?? '',
      r.SaaSPayType ?? '',
      Number(r.SaaSIncomeAmountClassic) || 0,
      Number(r.SaaSIncomeAmountNew) || 0,
      Number(r.SaasExpense) || 0,
      Number(r.PSIncomeAmount) || 0,
      Number(r.PSExpenseAmount) || 0,
      Number(r.LiabilityPortion) || 0,
      Number(r.DiscountPrepayPortion) || 0,
      Number(r.DiscountOtherPortion) || 0,
      Number(r.UncategorizedPortion) || 0,
      { formula: isNewCustomerSaaSFormula(excelRow) },
      Number(r.PackPaidCount) || 0,
      Number(r.UserPaidCount) || 0,
      r.Rep ?? '',
      r.Currency ?? '',
    ];
    sheet.addRow(row);
    excelRow += 1;
  }
  return excelRow - 2; // count of data rows added
}

function writeAccountsSheet(sheet, accountRows, fromDateUTC, toDateUTC) {
  clearDataRows(sheet);
  let excelRow = 2;
  for (const a of accountRows) {
    // Skip internal accounts that have zero activity. Mirrors API line 302.
    const allZero =
      Number(a.SaaSIncomeAmount || 0) === 0 &&
      Number(a.SaasExpense || 0) === 0 &&
      Number(a.PSIncomeAmount || 0) === 0 &&
      Number(a.PSExpenseAmount || 0) === 0 &&
      Number(a.LiabilityPortion || 0) === 0;
    if (a.Partner === 'Method Integration' && allZero) continue;

    const partner = a.Partner ?? '';
    const isPartnerManaged = partner ? PARTNER_MANAGED_SET.has(partner) : false;

    sheet.addRow([
      a.CompanyAccount ?? '',
      a.BOMCustomerGrouping ?? '',
      a.EOMCustomerGrouping ?? '',
      a.SaaSPayTypePeriod ?? '',
      a.SyncType ?? '',
      a.Channel ?? '',
      a.Platform ?? '',
      Number(a.AgeAtBOM) || 0,
      Number(a.SaaSIncomeAmount) || 0,
      Number(a.SaasExpense) || 0,
      Number(a.SaaSInvoiceCount) || 0,
      Number(a.PackPaidCount) || 0,
      Number(a.UserPaidCount) || 0,
      Number(a.PSIncomeAmount) || 0,
      Number(a.PSExpenseAmount) || 0,
      Number(a.LiabilityPortion) || 0,
      partner,
      isPartnerManaged,
      String(a.IsActive ?? '').toLowerCase() === 'true',
      a.MethodSignUpDate ? new Date(a.MethodSignUpDate) : null,
      a.FirstSaaSInvoiceTxnDate ? new Date(a.FirstSaaSInvoiceTxnDate) : null,
      a.MethodCancellationDate ? new Date(a.MethodCancellationDate) : null,
      { formula: isNewPayerFormula(excelRow) },
      a.MethodRep ?? '',
      a.Offering ?? '',
      Number(a.Att_Direct) || 0, Number(a.Att_SEO) || 0,
      Number(a.Att_OPN_Other_Peoples_Networks) || 0,
      Number(a.Att_Pay_Per_Click) || 0, Number(a.Att_Partners) || 0,
      Number(a.Att_Email) || 0, Number(a.Att_Remarketing) || 0,
      Number(a.Att_Social) || 0, Number(a.Att_Help_Center) || 0,
      Number(a.Att_Online_Chat_Tool) || 0, Number(a.Att_Content) || 0,
      Number(a.Att_Banner_Ads) || 0, Number(a.Att_Seminar_Conference) || 0,
      Number(a.Att_Referral_Program) || 0, Number(a.Att_Referral_Link) || 0,
      Number(a.Att_Backlinks) || 0, Number(a.Att_Other) || 0,
      Number(a.Att_None) || 0,
      a.SyncTypeRegion ?? '', a.Vertical ?? '', a.Sector ?? '',
      a.CustDatIndustry ?? '',
      a.CustDatFirstSyncCompleted ? new Date(a.CustDatFirstSyncCompleted) : null,
      a.CustDatLastRefreshed ? new Date(a.CustDatLastRefreshed) : null,
      Number(a.CustDatCountOfEmployees) || 0,
      Number(a.CustDatAnnualSales) || 0,
      Number(a.CustDatCountOfCustomers) || 0,
      Number(a.LicenseCount) || 0,
      Number(a.CountOfCustomScreens) || 0,
      Number(a.CountOfCustomScreensMN) || 0,
      fromDateUTC, toDateUTC,
      Boolean(a.IsConversionException),
      Boolean(a.IsChurnException),
      Number(a.Custdatlastsaasamount) || 0,
      Number(a.Custdatpreviouslastsaasamount) || 0,
      a.SaaSPayTypeCurrent ?? '',
    ]);
    excelRow += 1;
  }
  return excelRow - 2;
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function buildSaasDataExport({ fromDate, toDate, templateUrl, onProgress }) {
  const log = (msg) => { try { onProgress?.(msg); } catch {} };

  log('Querying invoices…');
  const invoices = await fetchTxns('Invoice', fromDate, toDate);
  log(`Querying credit memos… (${invoices.length} invoices)`);
  const creditMemos = await fetchTxns('CreditMemo', fromDate, toDate);
  log(`Querying accounts… (${creditMemos.length} credit memos)`);
  const accounts = await fetchAccounts(fromDate, toDate);
  log(`Building workbook… (${accounts.length} accounts)`);

  const accountByCA = new Map();
  for (const a of accounts) accountByCA.set(a.CompanyAccount, a);

  // Load the template (it has all the formula tabs pre-built).
  const tplRes = await fetch(templateUrl);
  if (!tplRes.ok) throw new Error(`Failed to load template: ${tplRes.status}`);
  const tplBuf = await tplRes.arrayBuffer();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(tplBuf);

  const sheetInvoices    = workbook.getWorksheet('Invoices');
  const sheetCreditMemos = workbook.getWorksheet('CreditMemos');
  const sheetAccounts    = workbook.getWorksheet('Accounts');
  const sheetCounts      = workbook.getWorksheet('CountsForFormulas');

  if (!sheetInvoices || !sheetCreditMemos || !sheetAccounts || !sheetCounts) {
    const have = workbook.worksheets.map(w => w.name).join(', ');
    throw new Error(`Template missing required sheets. Found: ${have}`);
  }

  // The template's row 1 is the header. Confirm it matches our expected schema
  // — if it doesn't, the formula tabs reference different cells than we're
  // about to write to and the report will silently mis-aggregate.
  const checkHeader = (sheet, expected) => {
    const actual = expected.map((_, i) => sheet.getRow(1).getCell(i + 1).value);
    const mismatch = expected.findIndex((h, i) => String(actual[i] ?? '').trim() !== h);
    if (mismatch >= 0) {
      console.warn(`[saas-export] Header mismatch on '${sheet.name}' col ${mismatch + 1}: expected '${expected[mismatch]}', got '${actual[mismatch]}'`);
    }
  };
  checkHeader(sheetInvoices, TXN_HEADER);
  checkHeader(sheetCreditMemos, TXN_HEADER);
  checkHeader(sheetAccounts, ACCOUNT_HEADER);

  const nInv = writeTxnSheet(sheetInvoices, invoices, accountByCA, fromDate, toDate);
  const nCM  = writeTxnSheet(sheetCreditMemos, creditMemos, accountByCA, fromDate, toDate);
  const nAcc = writeAccountsSheet(sheetAccounts, accounts, fromDate, toDate);

  // CountsForFormulas — API line 121-123: D3=Accounts, D4=Invoices, D5=CreditMemos.
  sheetCounts.getCell('D3').value = nAcc;
  sheetCounts.getCell('D4').value = nInv;
  sheetCounts.getCell('D5').value = nCM;

  log('Generating xlsx…');
  const outBuf = await workbook.xlsx.writeBuffer();
  return new Blob([outBuf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
