/**
 * Binwright Custom Dark-Themed Modal Dialog (Confirm, Alert, Prompt)
 * Replaces native browser alert(), confirm(), and prompt() popups
 */
(function (Binwright) {
    'use strict';

    let activeResolver = null;

    function getElements() {
        return {
            overlay: document.getElementById('confirmDialogModal'),
            title: document.getElementById('dialogTitle'),
            message: document.getElementById('dialogMessage'),
            inputWrap: document.getElementById('dialogInputWrap'),
            input: document.getElementById('dialogInput'),
            btnCancel: document.getElementById('btnDialogCancel'),
            btnConfirm: document.getElementById('btnDialogConfirm'),
            btnClose: document.getElementById('btnDialogClose')
        };
    }

    function closeDialog(result) {
        const els = getElements();
        if (els.overlay) {
            els.overlay.hidden = true;
        }
        if (activeResolver) {
            const resolver = activeResolver;
            activeResolver = null;
            resolver(result);
        }
    }

    function confirm({
        title = "Confirmation",
        message = "Are you sure you want to proceed?",
        confirmText = "Confirm",
        cancelText = "Cancel",
        isDanger = false
    } = {}) {
        const els = getElements();
        if (!els.overlay) {
            return Promise.resolve(window.confirm(message));
        }

        if (activeResolver) closeDialog(false);

        return new Promise(resolve => {
            activeResolver = resolve;

            els.title.textContent = title;
            els.message.textContent = message;
            els.message.hidden = !message;
            els.inputWrap.hidden = true;
            els.input.value = "";

            els.btnCancel.hidden = false;
            els.btnCancel.textContent = cancelText;

            els.btnConfirm.textContent = confirmText;
            els.btnConfirm.classList.toggle('is-danger', !!isDanger);

            els.overlay.hidden = false;
            els.btnConfirm.focus();
        });
    }

    function alert({
        title = "Notice",
        message = "",
        buttonText = "OK"
    } = {}) {
        const els = getElements();
        if (!els.overlay) {
            window.alert(message);
            return Promise.resolve();
        }

        if (activeResolver) closeDialog(false);

        return new Promise(resolve => {
            activeResolver = () => resolve();

            els.title.textContent = title;
            els.message.textContent = message;
            els.message.hidden = !message;
            els.inputWrap.hidden = true;
            els.input.value = "";

            els.btnCancel.hidden = true;

            els.btnConfirm.textContent = buttonText;
            els.btnConfirm.classList.remove('is-danger');

            els.overlay.hidden = false;
            els.btnConfirm.focus();
        });
    }

    function prompt({
        title = "Enter Value",
        message = "",
        defaultValue = "",
        placeholder = "",
        confirmText = "OK",
        cancelText = "Cancel"
    } = {}) {
        const els = getElements();
        if (!els.overlay) {
            return Promise.resolve(window.prompt(message, defaultValue));
        }

        if (activeResolver) closeDialog(null);

        return new Promise(resolve => {
            activeResolver = resolve;

            els.title.textContent = title;
            els.message.textContent = message;
            els.message.hidden = !message;

            els.inputWrap.hidden = false;
            els.input.value = defaultValue || "";
            els.input.placeholder = placeholder || "";

            els.btnCancel.hidden = false;
            els.btnCancel.textContent = cancelText;

            els.btnConfirm.textContent = confirmText;
            els.btnConfirm.classList.remove('is-danger');

            els.overlay.hidden = false;

            setTimeout(() => {
                els.input.focus();
                els.input.select();
            }, 50);
        });
    }

    function init() {
        const els = getElements();
        if (!els.overlay) return;

        els.btnCancel.addEventListener('click', () => closeDialog(els.inputWrap.hidden ? false : null));
        els.btnClose.addEventListener('click', () => closeDialog(els.inputWrap.hidden ? false : null));

        els.overlay.addEventListener('click', (e) => {
            if (e.target === els.overlay) {
                closeDialog(els.inputWrap.hidden ? false : null);
            }
        });

        els.btnConfirm.addEventListener('click', () => {
            if (!els.inputWrap.hidden) {
                closeDialog(els.input.value);
            } else {
                closeDialog(true);
            }
        });

        els.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                closeDialog(els.input.value);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeDialog(null);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (!els.overlay || els.overlay.hidden) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                closeDialog(els.inputWrap.hidden ? false : null);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    Binwright.dialog = { confirm, alert, prompt };
})(window.Binwright = window.Binwright || {});
