import WebSocket from "ws"
import Log from "../log"
import { ddsHost, ddsWS, fakeHeader } from "./ddsconstant"
import DdsCredit from "./ddscredit"

export default class DdsClient {
    protected credit:DdsCredit
    protected socket:WebSocket
    public constructor(credit:DdsCredit) {
        this.credit = credit
        // process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    }
    public async connectWS() {
        this.socket = new WebSocket(ddsWS, {
            rejectUnauthorized: false,
            origin: ddsHost,
            headers: {
                ...fakeHeader,
                Cookie: this.credit.getCookie(),
            },
        })
        this.socket.on("open", (ws:WebSocket) => {
            Log.d("WebSocket", "Hello!")
        })
    }
}