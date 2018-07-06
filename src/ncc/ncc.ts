import * as fs from "fs-extra";
import Session, { Credentials } from "node-ncc-es6";
import * as path from "path";
import * as read from "read";
import * as request from "request-promise-native";
import { CookieJar } from "tough-cookie";
import Config from "../config";

export default class Ncc {
    private credit:Credentials;
    private readonly cookiePath;
    private session:Session;
    constructor() {
        this.credit = null;
        this.cookiePath = path.resolve(Config.dirpath,"choco.cookie");
    }
    public async validateLogin():Promise<boolean> {
        if (this.credit == null) {
            return Promise.resolve(await this.loadCredit());
        }
        return this.credit.validateLogin().then(() => true).catch(() => false);
    }
    public async requestCredent(username?:string):Promise<Credentials> {
        if (username == null || username.length < 2) {
            username = await this.read("Username: ",false);
        }
        const password = await this.read("Password: ",true);
        return Promise.resolve(new Credentials(username,password));
    }
    public async login():Promise<Session> {
        await this.auth.import(true).catch();
        if (this.auth.cookie == null) {
            // input
            this.credit = await this.requestCredent(this.auth.username);
        } else {
            this.credit = new Credentials("id","pw");
            this.credit.setCookieJar(this.auth.cookie as CookieJar);
        }
        this.session = new Session(this.credit);

        const name:string = await this.credit.validateLogin().then((username) => username).catch((() => this.credit.login()).bind(this)).then((() => {
            this.auth.cookie = this.credit.getCookieJar();
            return null;
            // return this.auth.export();
        }).bind(this)).then(() => null).catch((err) => console.log(err.stack));
        if (name != null) {
            console.log(`Username: ${name}`);
        } else {
            console.log(`Username: ${await this.credit.validateLogin()}`);
        }
        await this.session.connect();
        return Promise.resolve(this.session);
    }
    private read(prompt:string,silent:boolean):Promise<string> {
        return new Promise((res,rej) => {
            read({prompt,silent},(err, pw:string) => err != null ? rej(err) : res(pw));
        });
    }
    private async loadCredit():Promise<boolean> {
        const credit:Credentials = new Credentials("id","pw");
        const cookieStr:string = await fs.readFile(this.cookiePath,"utf-8").catch(() => null);
        if (cookieStr == null) {
            return Promise.resolve(false);
        }
        credit.setCookieJar(JSON.parse(cookieStr));
        const result = await credit.validateLogin().then(() => true).catch(() => false);
        if (result) {
            this.credit = credit;
        }
        return Promise.resolve(result);
    }
}