import msgpack from "msgpack-lite"
import WebSocket from "ws"
import Log from "../log"
import { ddsHost, ddsWS, fakeHeader } from "./ddsconstant"
import DdsCredit from "./ddscredit"
import { DPK, DPKBase, DPKClient } from "./ddspacket"
import DsState from "./structure/dsstate"

export default class DdsClient {
    protected credit:DdsCredit
    protected socket:WebSocket
    protected state:DsState
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
        this.socket.binaryType = "arraybuffer"
        this.socket.on("open", (ws:WebSocket) => {
            Log.d("WebSocket", "Hello!")
        })
        this.socket.on("message", (ab:ArrayBuffer) => {
            const buffer = Buffer.from(ab)
            const json:DPK = msgpack.decode(buffer)
            this.onMessage(json)
        })
    }
    
    protected async onMessage(json:DPK) {
        switch (json.type) {
            case "welcome": {
                const {data} = json as DPK<"welcome">
                const seq = (data.moons.length >= 1) ? data.moons[0].seq : 0
                this.send("moon-selection", seq)
                break
            }
            case "welcome-moon": {
                const {data} = json as DPK<"welcome-moon">
                this.state = {
                    moonSeq: data.moon.seq,
                    moonName: data.moon.name,
                    moonBaptismal: data.moon.baptismal,
                    planetName: data.moon.localeInfo.id,
                    planetPosition: data.moon.planetPosition,
                    planetSize: data.moon.planetSize,
                    terrians: data.terrains,
                }
                Log.json("State", this.state)
                break
            }
        }
        Log.json("DdsMessage", json)
    }
    protected send<T extends keyof DPKClient>(type:T, data:DPKClient[T]) {
        this.socket.send(msgpack.encode({
            type,
            data,
        }), {binary: true}, (err) => Log.e(err))
    }
}