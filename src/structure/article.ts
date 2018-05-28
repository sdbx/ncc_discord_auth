import fetcher from "../fetcher";

export default class Article {
    public static readonly FLAG_FILE:number = 0b10000;
    public static readonly FLAG_IMAGE:number = 0b1000;
    public static readonly FLAG_VIDEO:number = 0b100;
    public static readonly FLAG_QUESTION:number = 0b10;
    public static readonly FLAG_VOTE:number = 0b1;

    public static flag(file:boolean,image:boolean,video:boolean,question:boolean,vote:boolean,flag:number = 0):number {
        return fetcher.genflag(flag,file,image,video,question,vote);
    }

    public id:number; // int, article id
    public title:string; // article title
    public flags:number; // int, (file,image,video,question,vote)
    public username:string;
    public userid:string; // real user identifier
    public link:string; // url
    public constructor(con:{id:number,title:string,username:string,userid:string,link:string,flags:number}) {
        this.id = (con.id == null) ? -1 : con.id;
        this.title = con.title;
        this.username = con.username;
        this.userid = con.userid;
        this.link = con.link;
        this.flags = (con.flags == null) ? 0 : con.flags;
    }
    public addFlag(type:number) {
        this.flags |= type;
    }
    public removeFlag(type:number) {
        this.flags &= ~type;
    }
    public getFlag(type:number):boolean {
        return (this.flags & type) >= 0;
    }
    public applyFlag(file:boolean,image:boolean,video:boolean,question:boolean,vote:boolean):void {
        this.flags = Article.flag(file,image,video,question,vote,this.flags);
    }
}
