(function (Binwright) {
    'use strict';

    Binwright.createPremiereBridge = function (interfaceInstance) {
        function call(method, callback, payload) {
            const args = payload === undefined ? '' :
                'decodeURIComponent("' + encodeURIComponent(JSON.stringify(payload)) + '")';
            interfaceInstance.evalScript('$._PPP_.' + method + '(' + args + ')', callback);
        }

        function onThemeChange(callback) {
            interfaceInstance.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, callback);
        }

        return { call, onThemeChange };
    };

    
})(window.Binwright = window.Binwright || {});
