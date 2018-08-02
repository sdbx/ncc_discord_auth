import chalk, { Chalk } from "chalk"
import { EventEmitter } from "events"
import * as fs from "fs-extra"
import Session, { Credentials } from "node-ncc-es6"
import * as path from "path"
import * as read from "read"
import * as request from "request-promise-native"
import { CookieJar } from "tough-cookie"
import Cache from "../cache"
import Config from "../config"
import Log from "../log"
import NCredit, { LoginError } from "./credit/ncredit"
import NCaptcha from "./ncaptcha"

export default class NcCredent extends EventEmitter {
    protected credit:NCredit
    protected readonly cookiePath
    private _name:Cache<string>
    constructor() {
        super()
        this.credit = new NCredit("id","pw")
        this.cookiePath = path.resolve(Config.dirpath,"choco.cookie")
        this._name = new Cache("",1)
    }
    /**
     * This is not mean "auth is vaild.".
     * But it means buffer!
     */
    public get available():boolean {
        return !this._name.expired && this._name.cache.length >= 2
    }
    public get username():string {
        return this.credit.username
    }
    public async availableAsync():Promise<boolean> {
        return Promise.resolve(this.available || await this.validateLogin() != null)
    }
    /**
     * Validate login
     * @returns naver username or null(error)
     */
    public async validateLogin():Promise<string> {
        const username:string = await this.credit.validateLogin().then((u) => u).catch(() => null)
        if (username != null) {
            this._name = new Cache(username, 43200)
        }
        return username
    }
    /**
     * make captcha from console
     * 
     * Require **LOGIN**
     */
    public async genCaptchaByConsole() {
        const captcha = await NCaptcha.gen(this.credit)
        Log.i("Captcha URL", captcha.url)
        const captchaRead = await Log.read("Captcha", { hide: false, logResult: true }).catch(() => "")
        captcha.value = captchaRead
        return captcha
    }
    /**
     * get credentials from console
     * @returns naver username or null(error)
     */
    public async genCreditByConsole():Promise<string> {
        const username = await Log.read("Username",{hide:false, logResult:true}).catch(() => "id")
        let password = await Log.read("Password",{hide:true, logResult:false}).catch(() => "__")
        let result:string | LoginError
        const first = true
        let captcha = null
        do {
            try {
                result = await this.requestCredent(username,password, captcha)
            } catch (err) {
                result = err
            }
            if (result == null) {
                return Promise.resolve(null)
            }
            if (typeof result === "string") {
                return Promise.resolve(result)
            }
            if (result.captcha) {
                Log.i("Captcha-URL", result.captchaURL)
                if (!first) {
                    password = await Log.read("Password",{hide:true, logResult:false}, password).catch(() => "__")
                }
                const captchaRead = await Log.read("Captcha", {hide:false, logResult: true}).catch(() => "")
                captcha = {
                    key: result.captchaKey,
                    value: captchaRead,
                }
            } else {
                return Promise.resolve(null)
            }
        } while (true)
    }
    /**
     * get credentials from userid and password
     * @returns naver username or null(error)
     * @param username naver id
     * @param password naver passwork(unencrypt)
     */
    public async requestCredent(username:string,password:string,
            captcha?:{key:string,value:string}):Promise<string> {
        this.credit.set(username, password)
        let errorCode:LoginError = null
        await this.credit.login(captcha).catch((err:LoginError) => errorCode = err)
        if (errorCode != null) {
            return Promise.reject(errorCode)
        }
        const name = await this.validateLogin()
        // this.credit.password = "__";
        if (name != null) {
            this.credit.username = name
            this._name = new Cache(name, 43200)
            await fs.writeFile(this.cookiePath, this.credit.export)
            await this.onLogin(name)
        } else {
            this._name.revoke()
        }
        return Promise.resolve(name)
    }
    /**
     * load credit from cookie
     * @returns naver username or null(error)
     */
    public async loadCredit():Promise<string> {
        this.credit.clear()
        const cookieStr:string = await fs.readFile(this.cookiePath, "utf-8").catch(() => null)
        if (cookieStr == null) {
            return Promise.resolve(null)
        }
        try {
            this.credit.import(cookieStr)
        } catch (err) {
            await fs.remove(this.cookiePath) 
            Log.e(err)
            return Promise.resolve(null)
        }
        const valid:string = await this.validateLogin().catch((err) => null)
        let userid:string = null
        if (valid != null) {
            userid = await this.credit.fetchUserID()
            this._name = new Cache(userid, 43200)
            await fs.writeFile(this.cookiePath, this.credit.export)
            await this.onLogin(userid)
        } else {
            this._name.revoke()
        }
        return Promise.resolve(userid == null ? valid : userid)
    }
    protected async onLogin(username:string):Promise<void> {
        Log.i("Runtime-ncc",`Logined by ${username}.`)
        return Promise.resolve()
    }
}