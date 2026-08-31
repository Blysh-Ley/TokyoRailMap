// UI readiness only: station-name resolution remains in the existing search action.
export const syncJourneySearchButtonAvailability = ({ button, inputs, mobile = false, independent = mobile } = {}) => {
    if (!button) return;
    const fields = Array.isArray(inputs) ? inputs : [];
    const filled = fields.length >= 2 && fields.every((input) => String(input?.value ?? '').trim());
    const disabled = independent && !filled;
    button.disabled = disabled;
    button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    button.classList.toggle('is-ready', independent && filled);
};
