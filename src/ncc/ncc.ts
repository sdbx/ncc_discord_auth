import Session from "node-ncc-es6";
import NcFetch from "./ncfetch";

export default class Ncc extends NcFetch {
    protected session:Session;
    constructor() {
        super();
    }
    protected async onLogin(username:string):Promise<void> {
        super.onLogin(username);
        this.session = new Session(this.credit);
        await this.session.connect();
        return Promise.resolve();
    }
    /**
     * get session
     */
    public get chat():Session {
        return this.session;
    }
}