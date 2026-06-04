'use strict';

const utils = require('@iobroker/adapter-core');
const mqtt = require('mqtt');
const https = require('https');

// Sensor-Definitionen aus dem HA-Adapter (const.py)
const SENSOR_TOPICS = {
    '4.182': { name: 'pH',                   coefficient: 10,  unit: '' },
    '4.82':  { name: 'Redox',                coefficient: 1,   unit: 'mV' },
    '4.98':  { name: 'Temperature',          coefficient: 10,  unit: '°C' },
    '4.102': { name: 'Conductivity',         coefficient: 10,  unit: 'mS/cm' },
    '4.107': { name: 'Battery Voltage',      coefficient: 100, unit: 'V' },
    '4.67':  { name: 'SW Version',           coefficient: 100, unit: '' },
    '5.29':  { name: 'Flow Pump Status',     coefficient: null, unit: '' },
    '5.80':  { name: 'pH Minus Canister',    coefficient: null, unit: '' },
    '5.83':  { name: 'Cover',                coefficient: null, unit: '' },
    '5.184': { name: 'Filtration Mode',      coefficient: null, unit: '' },
};

const BAYROL_HOST = 'www.bayrol-poolaccess.de';
const BAYROL_PORT = 8083;

class Bayrol extends utils.Adapter {

    constructor(options) {
        super({
            ...options,
            name: 'bayrol',
        });

        this.mqttClient = null;

        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Holt accessToken und deviceSerial von der Bayrol API
     * @param {string} appLinkCode - 8-stelliger App-Link-Code aus der Bayrol Pool Access App
     */
    fetchToken(appLinkCode) {
        return new Promise((resolve, reject) => {
            const url = `https://${BAYROL_HOST}/api/?code=${encodeURIComponent(appLinkCode)}`;
            https.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Ungültige JSON-Antwort von Bayrol API'));
                    }
                });
            }).on('error', reject);
        });
    }

    /** Legt ioBroker-States für alle Sensoren an */
    async createStates(deviceSerial) {
        for (const [topic, sensor] of Object.entries(SENSOR_TOPICS)) {
            const stateId = `${deviceSerial}.${topic.replace(/\./g, '_')}`;
            await this.setObjectNotExistsAsync(stateId, {
                type: 'state',
                common: {
                    name: sensor.name,
                    type: sensor.coefficient !== null ? 'number' : 'string',
                    role: 'value',
                    unit: sensor.unit,
                    read: true,
                    write: false,
                },
                native: {},
            });
        }
    }

    async onReady() {
        const appLinkCode = this.config.appLinkCode;

        if (!appLinkCode || appLinkCode.length !== 8) {
            this.log.error('Bitte einen gültigen 8-stelligen App-Link-Code in den Adaptereinstellungen eintragen.');
            return;
        }

        this.log.info('Verbinde mit Bayrol Pool Access...');

        let accessToken, deviceSerial;
        try {
            const result = await this.fetchToken(appLinkCode);
            accessToken = result.accessToken;
            deviceSerial = result.deviceSerial;
            if (!accessToken || !deviceSerial) {
                this.log.error(`Ungültige API-Antwort: ${JSON.stringify(result)}`);
                return;
            }
        } catch (err) {
            this.log.error(`Fehler beim Abrufen des Tokens: ${err.message}`);
            return;
        }

        this.log.info(`Gerät gefunden: ${deviceSerial}`);
        await this.createStates(deviceSerial);

        // MQTT-Verbindung zu Bayrol Cloud (WebSocket + TLS)
        const brokerUrl = `wss://${BAYROL_HOST}:${BAYROL_PORT}/mqtt`;
        this.mqttClient = mqtt.connect(brokerUrl, {
            username: accessToken,
            password: '1',
            rejectUnauthorized: true,
        });

        this.mqttClient.on('connect', () => {
            this.log.info('MQTT verbunden mit Bayrol Pool Access');
            for (const topic of Object.keys(SENSOR_TOPICS)) {
                // Abonnieren und initial abrufen
                this.mqttClient.subscribe(`d02/${deviceSerial}/v/${topic}`);
                this.mqttClient.publish(`d02/${deviceSerial}/g/${topic}`, '');
            }
        });

        this.mqttClient.on('message', (mqttTopic, payload) => {
            try {
                const topic = mqttTopic.split('/').pop();
                const sensor = SENSOR_TOPICS[topic];
                if (!sensor) return;

                const json = JSON.parse(payload.toString());
                let value = json.v;

                if (sensor.coefficient !== null && sensor.coefficient > 0) {
                    value = value / sensor.coefficient;
                }

                const stateId = `${deviceSerial}.${topic.replace(/\./g, '_')}`;
                this.setStateAsync(stateId, { val: value, ack: true });
                this.log.debug(`${sensor.name}: ${value}${sensor.unit ? ' ' + sensor.unit : ''}`);
            } catch (e) {
                this.log.error(`Fehler beim Verarbeiten der MQTT-Nachricht: ${e.message}`);
            }
        });

        this.mqttClient.on('error', (err) => {
            this.log.error(`MQTT Fehler: ${err.message}`);
        });

        this.mqttClient.on('reconnect', () => {
            this.log.info('MQTT Wiederverbindungsversuch...');
        });
    }

    onUnload(callback) {
        try {
            if (this.mqttClient) {
                this.mqttClient.end();
                this.mqttClient = null;
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
