import Session, { Message } from "node-ncc-es6";
import NcFetch from "./ncfetch";

export default class Ncc extends NcFetch {
    protected session:Session;
    constructor() {
        super();
    }
    public async getRoom(roomID:string) {
        if (await this.availableAsync()) {
            const rooms = (await this.chat.getRoomList()).filter((_v) => _v.id === roomID);
            for (const _room of rooms) {
                return _room;
            }
        }
        return null;
    }
    public async deleteRoom(roomID:string) {
        const room = await this.getRoom(roomID);
        if (room != null) {
            await this.chat.deleteRoom(room);
        }
        return Promise.resolve();
    }
    protected async onLogin(username:string):Promise<void> {
        super.onLogin(username);
        /*
        this.session = new Session(this.credit);
        await this.session.connect();
        await this.chat.getRoomList();
        this.chat.on("message",this.onNccMessage.bind(this));
        */
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