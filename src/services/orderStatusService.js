const VALID_ORDER_TRANSITIONS = {
  created: ['accepted', 'cancelled'],
  accepted: ['picked_up', 'cancelled'],
  picked_up: ['in_route', 'cancelled'],
  in_route: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: []
};

function canTransitionStatus(fromStatus, toStatus) {
  const allowed = VALID_ORDER_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

module.exports = {
  VALID_ORDER_TRANSITIONS,
  canTransitionStatus
};