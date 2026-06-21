export const appendSettingRow = (hostEl, container) => {
    const host = (hostEl && hostEl.appendChild) ? hostEl : document.body;
    if (host.firstChild) host.insertBefore(container, host.firstChild);
    else host.appendChild(container);
    return host;
};

export const createSegmentedSettingRow = ({
    hostEl,
    className = '',
    title = '',
    controlClassName = 'settings-seg',
    options = []
} = {}) => {
    const container = document.createElement('div');
    container.className = ['settings-item', className].filter(Boolean).join(' ');

    const text = document.createElement('span');
    text.className = 'settings-item-title';
    text.textContent = title;

    const seg = document.createElement('div');
    seg.className = ['settings-item-control', controlClassName].filter(Boolean).join(' ');

    const buttons = new Map();
    for (const option of options) {
        const value = String(option?.value ?? '');
        if (!value) continue;

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = String(option?.label ?? value);
        if (option?.className) button.className = String(option.className);
        if (option?.ariaLabel) button.setAttribute('aria-label', String(option.ariaLabel));
        seg.appendChild(button);
        buttons.set(value, button);
    }

    container.appendChild(text);
    container.appendChild(seg);
    appendSettingRow(hostEl, container);

    const setActive = (value) => {
        const current = String(value ?? '');
        buttons.forEach((button, key) => {
            button.classList.toggle('is-active', key === current);
        });
    };

    const setDisabled = (disabled) => {
        const on = disabled === true;
        container.classList.toggle('is-disabled', on);
        buttons.forEach((button) => {
            button.disabled = on;
            button.setAttribute('aria-disabled', on ? 'true' : 'false');
        });
    };

    return {
        buttons,
        container,
        control: seg,
        setActive,
        setDisabled,
        title: text
    };
};

export const createActionSettingRow = ({
    hostEl,
    className = '',
    title = '',
    actionLabel = '',
    actionAriaLabel = ''
} = {}) => {
    const container = document.createElement('div');
    container.className = ['settings-item', className].filter(Boolean).join(' ');

    const text = document.createElement('span');
    text.className = 'settings-item-title';
    text.textContent = title;

    const control = document.createElement('div');
    control.className = 'settings-item-control';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-action-btn';
    button.textContent = actionLabel;
    if (actionAriaLabel) button.setAttribute('aria-label', actionAriaLabel);

    control.appendChild(button);
    container.appendChild(text);
    container.appendChild(control);

    const host = (hostEl && hostEl.appendChild) ? hostEl : document.body;
    host.appendChild(container);

    return {
        button,
        container,
        control,
        title: text
    };
};
