import { describe, it, expect } from 'vitest';
import { fetchGroupedData } from '../../src/lib/bigquery.js';

describe('fetchGroupedData — input validation', () => {
  it('rejects SQL injection in groupByField', async () => {
    await expect(
      fetchGroupedData('v_trials', 'SignupDate', 'COUNT', 'month', '1; DROP TABLE--', null, 12)
    ).rejects.toThrow('Invalid groupByField');
  });

  it('rejects spaces in groupByField', async () => {
    await expect(
      fetchGroupedData('v_trials', 'SignupDate', 'COUNT', 'month', 'Channel OR 1=1', null, 12)
    ).rejects.toThrow('Invalid groupByField');
  });

  it('rejects empty groupByField', async () => {
    await expect(
      fetchGroupedData('v_trials', 'SignupDate', 'COUNT', 'month', '', null, 12)
    ).rejects.toThrow('Invalid groupByField');
  });

  it('rejects parentheses in groupByField', async () => {
    await expect(
      fetchGroupedData('v_trials', 'SignupDate', 'COUNT', 'month', 'CONCAT(a,b)', null, 12)
    ).rejects.toThrow('Invalid groupByField');
  });

  it('accepts valid column names without throwing validation error', async () => {
    const validNames = ['Channel', 'SignupCountry', 'CustDatIndustry', 'SyncType', 'Vertical', 'Att_SEO'];
    for (const name of validNames) {
      try {
        await fetchGroupedData('v_trials', 'SignupDate', 'COUNT', 'month', name, null, 12);
      } catch (e) {
        expect(e.message).not.toContain('Invalid groupByField');
      }
    }
  });
});
