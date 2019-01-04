import { Agent } from "https"
import fetch, { RequestInit } from "node-fetch"
import querystring from "querystring"
import orgrq from "request"
import request from "request-promise-native"
import { Cookie, CookieJar } from "tough-cookie"
import Log from "../log"
import { ddsHost, ddsLogin, fakeHeader } from "./ddsconstant"

export default class DdsCredit {
    public id:string
    protected cookieJar:CookieJar
    protected requestCookie:orgrq.CookieJar
    protected httpsAgent:Agent
    private _pw:string
    public set pw(str:string) {
        this._pw = str
    }
    public async login() {
        // reset cookie
        this.cookieJar = new CookieJar()
        this.requestCookie = orgrq.jar()
        this.httpsAgent = new Agent({
            keepAlive: true,
            keepAliveMsecs: 60000,
        })
        try {
            const genid = await this.req("GET", `${ddsHost}/`)
            if (!genid.ok) {
                throw new Error("Daldalso status: " + genid.status)
            }
            this.copyCookie([ddsHost], this.requestCookie, this.cookieJar)
            // got id, now try to login
            const loginRes = await this.req("POST", ddsLogin, {
                body: JSON.stringify({
                    id: this.id,
                    password: this._pw,
                }),
                headers:{
                    "Content-Type": "application/json"
                },
            })
            if (!loginRes.ok) {
                Log.w("ddsCredit", "Login failed.")
            } else {
                Log.i("ddsCredit", "Login success!")
                return true
            }
        } catch (err) {
            Log.e(err)
        }
        return false
    }
    public async checkLogined() {
        const statusCode = await request.get(`${ddsHost}/world`, {
            simple: false,
            headers: fakeHeader,
            jar: this.requestCookie,
            transform: (body, response, resolveWithFullResponse) => {
                return response.statusCode
            }
        }) as number
        if (statusCode === 200) {
            return true
        } else {
            return false
        }
    }
    public async req(type:"POST" | "GET" | "PUT" | "DELETE", url:string, options:Partial<RequestInit> = {}) {
        if (options.headers == null) {
            options.headers = {}
        }
        const result = await fetch(url, {
            ...options,
            method: type,
            headers: {
                ...fakeHeader,
                ...options.headers,
                "cookie": this.requestCookie.getCookieString(url),
            },
            agent: this.httpsAgent,
        })
        const cookie = result.headers.get("set-cookie")
        if (cookie != null) {
            this.requestCookie.setCookie(cookie, result.url)
        }
        return result
    }
    public getCookie() {
        return this.requestCookie.getCookieString(`${ddsHost}/`)
    }
    private copyCookie(sites:string[], cookie:orgrq.CookieJar, dest:CookieJar) {
        try {
            sites.forEach((v) => {
                const cookies = cookie.getCookies(v)
                for (const _cookie of cookies) {
                    const tCookie = new Cookie()
                    tCookie.key = _cookie.key
                    tCookie.value = _cookie.value
                    tCookie.expires = _cookie.expires
                    tCookie.domain = _cookie.domain
                    tCookie.path = _cookie.path
                    tCookie.httpOnly = _cookie.httpOnly
                    tCookie.secure = _cookie.secure
                    tCookie.expires = new Date(2050, 11, 30)
                    dest.setCookieSync(tCookie, v)
                }
            })
        } catch (err) {
            Log.e(err)
        }
    }
}