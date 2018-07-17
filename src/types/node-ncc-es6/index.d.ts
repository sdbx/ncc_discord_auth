declare module "node-ncc-es6" {
    import { CookieJar } from "tough-cookie";
    import { EventEmitter } from "events";
    import { Stream } from "stream";
    
    export class Room {
        cafe:Cafe;
        id:string;
        is1to1:boolean;
        isPublic:boolean;
        joined:boolean;
        lastMessage:Message;
        lastMsgSn:number;
        load:number;
        loading:boolean;
        master:User;
        maxUserCount:number;
        name:string;
        session:Session;
        sync:boolean;
        updated:Date;
        userCount:number;
        users:object
    }
    export class User {
        id:string;
        nickname:string;
        image:string;
        cafe:Cafe
    }
    export class Cafe {
        canClose:boolean;
        id:number;
        image:string;
        load:number;
        loading:boolean;
        name:string;
        rooms:{[roomid:string]:Room};
        session:Session;
        users:{[userid:string]:User};
    }
    export default class Session extends EventEmitter {
        cafes:{[cafeid:number]:Cafe};
        connected:boolean;
        credentials:Credentials;
        request:Function;
        rooms:{[roomid:string]:Room};
        roomsLoaded:boolean;
        server:string;
        sid:string;
        username:string;
        constructor (credentials:Credentials);
        handlePoll(data:any[]);
        sendText(room:Room,text:string):Promise<void>;
        sendSticker(room:Room,stickerId:string):Promise<void>;
        sendImage(room:Room,image:Stream | object, options:any):Promise<void>;
        on(eventType:"message",callback:(message:Message) => void):this;
        on(eventType:"error",callback:(error:any) => void):this;
        connect(retries?:number, err?:any):Promise<void>;
        disconnect():void;
        sendCommand(command:string,body:object):Promise<any>;
        /**
         * However, creating non-1to1 room isn't supported now. Be careful.
         * @param cafe Cafe id
         * @param userList List of user
         * @param options No
         * @param captcha Matter
         */
        createRoom(cafe:Cafe | {id:number},userList:Array<User | {id:string}>,options?:{name:string,isPublic:boolean},captcha?:{key:string,value:string}):Promise<Room>;
        inviteRoom(room:{cafe:Cafe | {id:number},id:string}):Promise<void>;
        /**
         * This deletes room from the USER. which means, this doesn't terminate the room.
         * @param room room~
         */
        deleteRoom(room:Room):Promise<Room>;
        /**
         * This closes the room forcefully. Only staffs are able to do it.
         * @param room Room~
         */
        closeOpenroom(room:Room):Promise<Room>;
        /**
         * Fetches data from the server and elevates loading level to 0
         * This also joins to the room if the user hasn't joined yet. Quite
         * weird, right?
         * @param room Room~
         */
        syncRoom(room:Room):Promise<Room>;
        joinRoom(cafeId:number, roomId:string):Promise<Room>;
        /**
         * Fetches connected chat room list
         */
        getRoomList():Promise<Room[]>;
        /**
         * Changes room name
         * @param room Room~
         * @param name room name
         */
        changeRoomName(room:Room,name:string):Promise<void>;
        /**
         * Hands room master; Can accept user ID or user object.
         * @param room room~
         * @param id user id or user object
         */
        delegateMaster(room:Room,id:string | User):Promise<void>;
        /**
         * 'Bans' the user. Can accept user ID or user object.
         * @param room Room~
         * @param user user id or user object
         */
        rejectMember(room:Room,user:string | User):Promise<void>;
        /**
         * Returns a list of cafe open rooms
         * @param cafe Cafe Object
         * @param order time or name
         * @param page page?
         */
        findOpenRoomList(cafe:Cafe | {id:number}, order?:["time","name"], page?:number):Promise<Room[]>;
        /**
         * Returns a list of joined cafes
         */
        findMyCafeList():Promise<Cafe[]>;
        /**
         * Syncs lost message from the server
         * @param room room!
         */
        syncMsg(room:Room):Promise<void>;
        /**
         * Sends a message to the server
         * @param message object... what?
         */
        sendMsg(message:object):Promise<void>;
        /**
         * Get old messages and returns them.
         * @param room room id
         * @param start start of message id
         * @param end end of message id
         */
        getMsg(room:Room | {cafe:Cafe | {id:number},id:string}, start:number, end:number):Promise<Message[]>;
        /**
         * Send an acknowledge to the server. However, this is only necessary if
         * you're making an actual chat client, it's not required for bots.
         * However, node-ncc-es6 doesn't handle lastAckSn yet, so this isn't likely
         * to be used anyway. TODO feel free to send a pull request.
         * @param message message
         */
        ackMsg(message:Message):Promise<void>;
    }
    export class Message {
        id:number;
        message:string;
        room:Room;
        sent:boolean;
        target:Array<User>;
        time:Date;
        type:["text","invite","leave","changeName","changeMaster","join","reject","create","sticker","image","tvcast"];
        user:User;
    }
    export class Credentials extends EventEmitter {
        cookieJar:CookieJar;
        password:string;
        username:string;
        constructor (username:string, password:string);
        setCookieJar(cookieJar:CookieJar.Serialized);
        getCookieJar():CookieJar.Serialized;
        validateLogin():Promise<string>;
        login(captcha?:{key:string,value:string}):Promise<void>;
        logout():Promise<void>;
    }
}