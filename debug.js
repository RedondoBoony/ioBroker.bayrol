'use strict';

// Simuliert die ioBroker-Umgebung lokal
process.env.DEBUG = '*';

// App-Link-Code hier eintragen zum Testen (8 Zeichen, aus Bayrol Pool Access App)
const config = {
    appLinkCode: 'XXXXXXXX',
};

// Minimaler ioBroker-Stub
const utils = require('@iobroker/adapter-core');
const originalAdapter = utils.Adapter;

// Überschreibe den Adapter-Konstruktor mit einer Test-Version
const AdapterMock = function(options) {
    this.config = config;
    this.log = {
        info:  (msg) => console.log(`[INFO]  ${msg}`),
        warn:  (msg) => console.warn(`[WARN]  ${msg}`),
        error: (msg) => console.error(`[ERROR] ${msg}`),
        debug: (msg) => console.log(`[DEBUG] ${msg}`),
    };
    this.on = (event, handler) => {
        if (event === 'ready') setTimeout(handler, 100);
        if (event === 'unload') process.on('SIGINT', () => handler(() => process.exit(0)));
    };
};
utils.Adapter = AdapterMock;

// Lade den echten Adapter
require('./main.js');
