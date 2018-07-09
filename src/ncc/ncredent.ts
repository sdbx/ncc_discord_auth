import * as fs from "fs-extra";
import Session, { Credentials } from "node-ncc-es6";
import * as path from "path";
import * as read from "read";
import * as request from "request-promise-native";
import { CookieJar } from "tough-cookie";
import Config from "../config";

export default class NcCredent {
    protected credit:Credentials;
    protected readonly cookiePath;
    protected inited:boolean;
    constructor() {
        this.inited = false;
        this.credit = new Credentials("id","pw");
        this.cookiePath = path.resolve(Config.dirpath,"choco.cookie");
    }
    /**
     * This is not mean "auth is vaild.".
     */
    public get available():boolean {
        return this.inited;
    }
    /**
     * Validate login
     * @returns naver username or null(error)
     */
    public async validateLogin():Promise<string> {
        return this.credit.validateLogin().then((u) => u).catch(() => null);
    }
    /**
     * get credentials from console
     * @returns naver username or null(error)
     */
    public async genCreditByConsole():Promise<string> {
        const username = await this.read("Username: ",false);
        const password = await this.read("Password: ",true);
        return this.requestCredent(username,password);
    }
    /**
     * get credentials from userid and password
     * @returns naver username or null(error)
     * @param username naver id
     * @param password naver passwork(unencrypt)
     */
    public async requestCredent(username:string,password:string):Promise<string> {
        this.credit = new Credentials(username,password);
        await this.credit.login();
        const name = await this.validateLogin();
        if (name != null) {
            await fs.writeFile(this.cookiePath, JSON.stringify(this.credit.getCookieJar()));
            await this.onLogin(name);
        }
        return Promise.resolve(name);
    }
    /**
     * load credit from cookie
     * @returns naver username or null(error)
     */
    public async loadCredit():Promise<string> {
        this.credit = new Credentials("id", "pw");
        const cookieStr:string = await fs.readFile(this.cookiePath, "utf-8").catch(() => null);
        if (cookieStr == null) {
            return Promise.resolve(null);
        }
        this.credit.setCookieJar(JSON.parse(cookieStr));
        const result:string = await this.validateLogin();
        if (result != null) {
            await fs.writeFile(this.cookiePath, JSON.stringify(this.credit.getCookieJar()));
            await this.onLogin(result);
        }
        return Promise.resolve(result);
    }
    protected async onLogin(username:string):Promise<void> {
        console.log("Login. - ncc");
        this.inited = true;
        return Promise.resolve();
    }
    /*
    public async login():Promise<Session> {
        let name;
        name = await this.loadCredit();
        if (name == null) {
            do {
                name = await this.genCreditByConsole();
            } while (name == null);
        }
        console.log(`Username: ${name}`);
        this.session = new Session(this.credit);
        await this.session.connect();
        return Promise.resolve(this.session);
    }
    */
    private read(prompt:string,silent:boolean):Promise<string> {
        return new Promise((res,rej) => {
            read({prompt,silent},(err, pw:string) => err != null ? rej(err) : res(pw));
        });
    }
}