'use strict';

const utils = require('@iobroker/adapter-core');
const puppeteer = require('puppeteer');

class Bayrol extends utils.Adapter {

    constructor(options) {
        super({
            ...options,
            name: 'bayrol',
        });

        this.interval = null;
        this.browser = null;

        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async scrapeLatestMail() {
        const username = this.config.username;
        const password = this.config.password;

        let browser = null;
        try {
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
            const page = await browser.newPage();

            // Login
            await page.goto('https://mail.rutten.ch/', { waitUntil: 'networkidle2' });
            await page.type('input[name="username"]', username);
            await page.type('input[name="password"]', password);
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2' }),
                page.click('button[type="submit"], input[type="submit"]'),
            ]);

            // Warte auf Weiterleitung zur Inbox (SOGo oder ähnlich)
            await page.waitForTimeout(3000);

            const currentUrl = page.url();
            this.log.debug(`Nach Login URL: ${currentUrl}`);

            // Versuche den neuesten Mail-Betreff zu finden
            const subject = await page.evaluate(() => {
                // Allgemeine Selektoren für Mailcow / SOGo
                const selectors = [
                    '.sg-mail-subject',
                    '.messageSubject',
                    '[class*="subject"]',
                    '[class*="Subject"]',
                    'td.subject',
                ];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el && el.innerText) return el.innerText.trim();
                }
                return null;
            });

            if (subject) {
                this.log.info(`Neueste Mail Betreff: ${subject}`);
            } else {
                this.log.warn('Konnte keinen Mail-Betreff finden. Seiten-Struktur eventuell abweichend.');
            }

        } catch (err) {
            this.log.error(`Scraping-Fehler: ${err.message}`);
        } finally {
            if (browser) await browser.close();
        }
    }

    async onReady() {
        const username = this.config.username;
        const password = this.config.password;

        if (!username || !password) {
            this.log.warn('Benutzername oder Passwort nicht konfiguriert. Bitte in den Adaptereinstellungen eintragen.');
            return;
        }

        this.log.info(`Adapter gestartet. Starte Scraping für: ${username}`);

        // Sofort starten, dann alle 10 Sekunden
        await this.scrapeLatestMail();
        this.interval = setInterval(() => {
            this.scrapeLatestMail();
        }, 10000);
    }

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
