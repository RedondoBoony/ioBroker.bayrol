'use strict';

const utils = require('@iobroker/adapter-core');

class Bayrol extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'bayrol',
        });

        this.interval = null;

        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        const username = this.config.username;

        if (!username) {
            this.log.warn('Kein Benutzername konfiguriert. Bitte in den Adaptereinstellungen eintragen.');
            return;
        }

        this.log.info(`Adapter gestartet. Benutzername: ${username}`);

        // Log den Benutzernamen alle 5 Sekunden
        this.interval = setInterval(() => {
            this.log.info(`Benutzername: ${username}`);
        }, 5000);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            if (this.interval) {
                clearInterval(this.interval);
                this.interval = null;
            }
            callback();
        } catch (e) {
            callback();
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new Bayrol(options);
} else {
    // otherwise start the instance directly
    new Bayrol();
}
