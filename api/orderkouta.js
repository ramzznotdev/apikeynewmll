const express = require('express');
const https = require('https');
const http = require('http');
const { URLSearchParams } = require('url');
const router = express.Router();

// =============================================
// ORDERKUOTA CLIENT CLASS (Convert from PHP)
// =============================================
class OrderkuotaClient {
    constructor() {
        this.baseUrl = 'app.orderkuota.com';
        this.timeout = 30000;
        this.cookies = {};
        this.token = '';
        this.userId = '';
        this.username = '';
        this.isAuthenticated = false;
    }

    _cookieString() {
        return Object.entries(this.cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }

    _parseCookies(setCookieHeaders) {
        if (!setCookieHeaders || !Array.isArray(setCookieHeaders)) return;
        for (const cookieStr of setCookieHeaders) {
            const parts = cookieStr.split(';')[0].split('=');
            if (parts.length === 2) {
                this.cookies[parts[0].trim()] = parts[1].trim();
            }
        }
    }

    /**
     * Base HTTP Request — pake native https module (biar persis kayak cURL PHP)
     * No axios, no extra headers!
     */
    async _request(endpoint, bodyParams = {}) {
        const ts = Date.now();

        const defaultBody = {
            request_time: ts,
            app_reg_id: 'dummy_reg_id_kalo_ada',
            phone_android_version: '12',
            app_version_code: '260204',
            phone_uuid: 'dummy_uuid_karena_ga_di_cek',
            app_version_name: '26.02.04',
            ui_mode: 'light',
            phone_model: 'vivo 1920'
        };

        const mergedBody = { ...defaultBody, ...bodyParams };

        if (this.token && this.username) {
            mergedBody.auth_token = this.token;
            mergedBody.auth_username = this.username;
        }

        const bodyStr = new URLSearchParams(mergedBody).toString();

        const headers = {
            'User-Agent': 'okhttp/5.3.2',
            'Content-Type': 'application/x-www-form-urlencoded',
            'signature': 'dummy',
            'timestamp': ts.toString()
        };

        const cookieHeader = this._cookieString();
        if (cookieHeader) {
            headers['Cookie'] = cookieHeader;
        }

        return new Promise((resolve, reject) => {
            const url = new URL(`https://${this.baseUrl}${endpoint}`);
            
            const options = {
                hostname: url.hostname,
                port: 443,
                path: url.pathname,
                method: 'POST',
                headers: headers,
                timeout: this.timeout
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    // Parse cookies from response headers
                    if (res.headers['set-cookie']) {
                        this._parseCookies(res.headers['set-cookie']);
                    }

                    let data;
                    try {
                        data = JSON.parse(body);
                    } catch (e) {
                        data = null;
                    }

                    resolve({
                        statusCode: res.statusCode,
                        data: data
                    });
                });
            });

            req.on('error', (err) => {
                reject(new Error(`API Request failed: ${err.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(bodyStr);
            req.end();
        });
    }

    async getOTP(username, password) {
        this.username = username;

        const res = await this._request('/api/v2/login', {
            username: username,
            password: password
        });

        const data = res.data;
        if (data && data.success) {
            const otpMethod = data.results?.otp || 'email';
            const otpVal = data.results?.otp_value || 'tersembunyi';
            return { success: true, message: `OTP dikirim via ${otpMethod} ke ${otpVal}` };
        }

        return { success: false, message: data?.message || 'Gagal mendapatkan OTP' };
    }

    async authenticate(otp) {
        if (!this.username) {
            return { success: false, message: 'Username belum di set (panggil getOTP dulu)' };
        }

        const res = await this._request('/api/v2/login', {
            username: this.username,
            password: otp
        });

        const data = res.data;
        if (data && data.success && data.results?.token) {
            this.isAuthenticated = true;
            this.token = data.results.token;
            this.userId = data.results.id;

            return {
                success: true,
                data: data.results,
                message: `Login berhasil atas nama ${data.results.name}`
            };
        }

        return { success: false, message: 'Kode OTP salah/kedaluwarsa' };
    }

    async getMutasiQris(page = 1) {
        if (!this.isAuthenticated || !this.userId) {
            throw new Error('Belum auth atau userId kosong!');
        }

        const res = await this._request(`/api/v2/qris/mutasi/${this.userId}`, {
            'requests[0]': 'account',
            'requests[qris_history][page]': page,
            'requests[qris_history][keterangan]': '',
            'requests[qris_history][jumlah]': '',
            'requests[qris_history][dari_tanggal]': '',
            'requests[qris_history][ke_tanggal]': ''
        });

        const data = res.data;
        if (data && data.success) {
            return {
                success: true,
                info: data.account?.results || {},
                mutasi: data.qris_history?.results || []
            };
        }

        return { success: false, message: 'Gagal parse data mutasi' };
    }

    async getQrisMenu() {
        if (!this.isAuthenticated || !this.userId) {
            throw new Error('Belum auth atau userId kosong!');
        }

        const res = await this._request(`/api/v2/qris/menu/${this.userId}`, {
            'requests[0]': 'account',
            'requests[1]': 'qris_menu'
        });

        const data = res.data;
        if (data && data.success) {
            return {
                success: true,
                download_url: data.qris_menu?.results?.download || '',
                info: data.account?.results || {}
            };
        }

        return { success: false, message: 'Gagal ambil QRIS menu' };
    }

    exportSession() {
        return {
            cookies: this.cookies,
            token: this.token,
            userId: this.userId,
            username: this.username,
            isAuthenticated: this.isAuthenticated,
            savedAt: new Date().toISOString()
        };
    }

    importSession(session) {
        if (!session) return;
        this.cookies = session.cookies || {};
        this.token = session.token || '';
        this.userId = session.userId || '';
        this.username = session.username || '';
        this.isAuthenticated = session.isAuthenticated || false;
    }
}

// =============================================
// SESSION HELPER
// =============================================
function getClient(req) {
    const client = new OrderkuotaClient();
    const sessionJson = req.headers['x-session'];
    if (sessionJson) {
        try {
            client.importSession(JSON.parse(sessionJson));
        } catch (e) {
            // Invalid session, ignore
        }
    }
    return client;
}

// =============================================
// ORDERKOUTA ROUTES
// =============================================

router.post('/get-otp', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ status: false, message: 'Username dan password wajib' });
        }

        const client = getClient(req);
        const result = await client.getOTP(username, password);

        return res.json({
            status: result.success,
            message: result.message,
            session: client.exportSession()
        });
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message });
    }
});

router.post('/verify-otp', async (req, res) => {
    try {
        const { otp } = req.body;
        if (!otp) {
            return res.status(400).json({ status: false, message: 'OTP wajib' });
        }

        const client = getClient(req);
        const result = await client.authenticate(otp);

        if (result.success) {
            return res.json({
                status: true,
                message: result.message,
                data: result.data,
                session: client.exportSession()
            });
        }

        return res.status(401).json({ status: false, message: result.message });
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message });
    }
});

router.get('/mutasi', async (req, res) => {
    try {
        const client = getClient(req);
        if (!client.isAuthenticated) {
            return res.status(401).json({ status: false, message: 'Belum login' });
        }

        const page = req.query.page || 1;
        const result = await client.getMutasiQris(page);

        return res.json({
            status: result.success,
            data: result,
            session: client.exportSession()
        });
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message });
    }
});

router.get('/menu', async (req, res) => {
    try {
        const client = getClient(req);
        if (!client.isAuthenticated) {
            return res.status(401).json({ status: false, message: 'Belum login' });
        }

        const result = await client.getQrisMenu();
        return res.json({
            status: result.success,
            data: result,
            session: client.exportSession()
        });
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message });
    }
});

router.get('/profile', (req, res) => {
    const client = getClient(req);
    return res.json({
        status: true,
        data: {
            username: client.username,
            is_authenticated: client.isAuthenticated,
            user_id: client.userId
        },
        session: client.exportSession()
    });
});

router.post('/logout', (req, res) => {
    const freshClient = new OrderkuotaClient();
    return res.json({
        status: true,
        message: 'Logout berhasil',
        session: freshClient.exportSession()
    });
});

module.exports = router;