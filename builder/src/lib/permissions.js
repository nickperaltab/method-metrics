export function isAdmin(user) {
  return user?.role === 'admin';
}

export function canApprove(user) {
  return isAdmin(user);
}

export function canDelete(user, item) {
  return item?.created_by_user === user?.id;
}

export function canEdit(user, item) {
  return item?.created_by_user === user?.id;
}
