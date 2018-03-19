export default class Comment {
    public content:string;
    public userid:string;
    public nickname:string;
    public timestamp:number;

    public constructor(con:any) {
        this.content = con.content;
        this.userid = con.userid;
        this.nickname = con.nickname;
        this.timestamp = (con.timestamp == null) ? Date.now() : con.timestamp;
    }
    public getTimeDiffer() {
        return new Date().getTime() - this.timestamp;
    }
}
