import Session, { Message } from "node-ncc-es6";
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
        this.chat.on("message",this.onNccMessage.bind(this));
        return Promise.resolve();
    }
    protected async onNccMessage(message:Message) {
        this.emit("message",message);
    }
    /**
     * get session
     */
    public get chat():Session {
        return this.session;
    }
}