const express = require('express');
const axios = require('axios');
const router = express.Router();

// =============================================
// ORDERKUOTA CLIENT CLASS
// =============================================
class OrderkuotaClient {
    constructor() {
        this.baseUrl = 'https://app.orderkuota.com';
        this.timeout = 30000;
        this.cookies = {};
        this.token = '';
        this.userId = '';
        this.username = '';
        this.isAuthenticated = false;
    }

    _cookieString() {
        return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    }

    _parseCookies(setCookieHeaders) {
        if (!setCookieHeaders) return;
        for (const cookieStr of setCookieHeaders) {
            const parts = cookieStr.split(';')[0].split('=');
            if (parts.length === 2) this.cookies[parts[0].trim()] = parts[1].trim();
        }
    }

    async _request(endpoint, bodyParams = {}) {
    const url = this.baseUrl + endpoint;
    const ts = Date.now();
    
    // Random device ID setiap request (lebih natural)
    const randomUUID = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    
    const defaultBody = {
        request_time: ts,
        app_reg_id: 'APA91b' + Math.random().toString(36).substring(2, 15),
        phone_android_version: '13',
        app_version_code: '260204',
        phone_uuid: randomUUID,
        app_version_name: '26.02.04',
        ui_mode: 'light',
        phone_model: 'SM-G998B',  // Samsung Galaxy S21 Ultra
        phone_manufacture: 'samsung'
    };
    
    const mergedBody = { ...defaultBody, ...bodyParams };
    
    if (this.token && this.username) {
        mergedBody.auth_token = this.token;
        mergedBody.auth_username = this.username;
    }
    
    const bodyStr = new URLSearchParams(mergedBody).toString();
    
    // Headers lebih lengkap
    const headers = {
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 13; SM-G998B Build/TP1A.220624.014)',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'signature': this._generateSignature(ts),
        'timestamp': ts.toString(),
        'X-Requested-With': 'XMLHttpRequest'
    };
    
    const cookieHeader = this._cookieString();
    if (cookieHeader) headers['Cookie'] = cookieHeader;

    try {
        const response = await axios.post(url, bodyStr, {
            headers,
            timeout: this.timeout,
            responseType: 'json',
            // Penting: jangan follow redirect
            maxRedirects: 0,
            validateStatus: (status) => status < 500
        });
        
        this._parseCookies(response.headers['set-cookie']);
        
        // Handle status 469 khusus
        if (response.status === 469) {
            throw new Error('Diblokir oleh server (469). Coba lagi nanti atau ganti koneksi.');
        }
        
        return { statusCode: response.status, data: response.data };
    } catch (error) {
        if (error.response?.headers?.['set-cookie']) {
            this._parseCookies(error.response.headers['set-cookie']);
        }
        
        // Handle 469 dengan pesan lebih jelas
        if (error.response?.status === 469) {
            throw new Error('Server OrderKouta memblokir request. Kemungkinan: IP diblokir, terlalu banyak percobaan, atau maintenance.');
        }
        
        throw new Error(error.message);
    }
}

// Generate signature sederhana (kalau diperlukan)
_generateSignature(ts) {
    // Simulasi signature dari app
    const data = ts.toString() + 'orderkuota';
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(16);
}

    async getOTP(username, password) {
        this.username = username;
        const res = await this._request('/api/v2/login', { username, password });
        if (res.data?.success) return { success: true, message: `OTP dikirim via ${res.data.results.otp}` };
        return { success: false, message: res.data?.message || 'Gagal' };
    }

    async authenticate(otp) {
        if (!this.username) return { success: false, message: 'Username belum di set' };
        const res = await this._request('/api/v2/login', { username: this.username, password: otp });
        if (res.data?.success && res.data.results?.token) {
            this.isAuthenticated = true;
            this.token = res.data.results.token;
            this.userId = res.data.results.id;
            return { success: true, data: res.data.results, message: 'Login berhasil' };
        }
        return { success: false, message: 'OTP salah' };
    }

    async getMutasiQris(page = 1) {
        if (!this.isAuthenticated) throw new Error("Belum auth!");
        const res = await this._request(`/api/v2/qris/mutasi/${this.userId}`, {
            'requests[0]': 'account', 'requests[qris_history][page]': page,
            'requests[qris_history][keterangan]': '', 'requests[qris_history][jumlah]': '',
            'requests[qris_history][dari_tanggal]': '', 'requests[qris_history][ke_tanggal]': ''
        });
        if (res.data?.success) return { success: true, info: res.data.account?.results, mutasi: res.data.qris_history?.results || [] };
        return { success: false, message: 'Gagal' };
    }

    async getQrisMenu() {
        if (!this.isAuthenticated) throw new Error("Belum auth!");
        const res = await this._request(`/api/v2/qris/menu/${this.userId}`, {
            'requests[0]': 'account', 'requests[1]': 'qris_menu'
        });
        if (res.data?.success) return { success: true, download_url: res.data.qris_menu?.results?.download || '', info: res.data.account?.results };
        return { success: false, message: 'Gagal' };
    }

    exportSession() {
        return { cookies: this.cookies, token: this.token, userId: this.userId, username: this.username, isAuthenticated: this.isAuthenticated };
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
        try { client.importSession(JSON.parse(sessionJson)); } catch (e) {}
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
            return res.status(400).json({ 
                status: false, 
                message: 'Username dan password wajib diisi' 
            });
        }
        
        const client = getClient(req);
        
        // Coba maksimal 2x dengan delay kalau kena 469
        let result;
        let attempts = 0;
        const maxAttempts = 2;
        
        while (attempts < maxAttempts) {
            try {
                result = await client.getOTP(username, password);
                break; // Sukses, keluar dari loop
            } catch (err) {
                attempts++;
                if (attempts >= maxAttempts) throw err;
                // Tunggu 2 detik sebelum retry
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        return res.json({ 
            status: result.success, 
            message: result.message, 
            session: client.exportSession() 
        });
        
    } catch (err) {
        return res.status(500).json({ 
            status: false, 
            message: err.message,
            hint: 'Jika error 469, coba: 1) Tunggu 5-10 menit 2) Ganti koneksi internet 3) Gunakan VPN'
        });
    }
});

router.post('/verify-otp', async (req, res) => {
    try {
        const { otp } = req.body;
        if (!otp) return res.status(400).json({ status: false, message: 'OTP wajib' });
        const client = getClient(req);
        const result = await client.authenticate(otp);
        if (result.success) {
            return res.json({ status: true, message: result.message, data: result.data, session: client.exportSession() });
        }
        return res.status(401).json({ status: false, message: result.message });
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message });
    }
});

router.get('/mutasi', async (req, res) => {
    try {
        const client = getClient(req);
        if (!client.isAuthenticated) return res.status(401).json({ status: false, message: 'Belum login' });
        const result = await client.getMutasiQris(req.query.page || 1);
        return res.json({ status: result.success, data: result, session: client.exportSession() });
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message });
    }
});

router.get('/menu', async (req, res) => {
    try {
        const client = getClient(req);
        if (!client.isAuthenticated) return res.status(401).json({ status: false, message: 'Belum login' });
        const result = await client.getQrisMenu();
        return res.json({ status: result.success, data: result, session: client.exportSession() });
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message });
    }
});

router.get('/profile', (req, res) => {
    const client = getClient(req);
    return res.json({ status: true, data: { username: client.username, is_authenticated: client.isAuthenticated }, session: client.exportSession() });
});

router.post('/logout', (req, res) => {
    return res.json({ status: true, message: 'Logout berhasil', session: new OrderkuotaClient().exportSession() });
});

module.exports = router;