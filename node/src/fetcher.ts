import * as cheerio from 'cheerio';
import * as encoding from 'encoding';
import * as request from 'request-promise-native';

const articleURL:string = "http://cafe.naver.com/ArticleList.nhn";
export class Article {
    public static readonly FLAG_FILE:number = 0b10000;
    public static readonly FLAG_IMAGE:number = 0b1000;
    public static readonly FLAG_VIDEO:number = 0b100;
    public static readonly FLAG_QUESTION:number = 0b10;
    public static readonly FLAG_VOTE:number = 0b1;
    public constructor(con:any) {
        this.id = (con.id == null) ? -1 : con.id;
        this.title = con.title;
        this.username = con.username;
        this.userid = con.userid;
        this.link = con.link;
        this.flags = (con.flags == null) ? 0 : con.flags;
    }
    public addFlag(type:number){
        this.flags |= type;
    }
    public removeFlag(type:number){
        this.flags &= ~type;
    }
    public getFlag(type:number):boolean {
        return (this.flags & type) >= 0;
    }
    public applyFlag(file:boolean,image:boolean,video:boolean,question:boolean,vote:boolean):void {
        this.flags = Article.flag(file,image,video,question,vote,this.flags);
    }
    public static flag(file:boolean,image:boolean,video:boolean,question:boolean,vote:boolean,flag:number=0):number {
        return genflag(flag,file,image,video,question,vote);
    }
    public id:number; // int, article id
    public title:string; // article title
    public flags:number; // int, (file,image,video,question,vote)
    public username:string;
    public userid:string; // real user identifier
    public link:URL; // url
}

export module fetcher {
    export async function getWeb(requrl:string,param:object) {
        let buffer = await request({
            url: requrl,
            qs: param,
            encoding: null
        });
        let body:string = encoding.convert(buffer, "utf-8","euc-kr").toString();
        return cheerio.load(body);
    }
    export async function getArticles(cafeid:Number) {
        let params:Object = {
            'search.clubid':cafeid.toString(),
            'search.boardtype':"L",
            'userDisplay':"5"
        }
        let $:any = await getWeb(articleURL,params);
        
        let articleList:any = $('[name="ArticleList"] > table > tbody > tr:nth-child(2n+1)')
        .map((i, el) => { console.log($(el).children('td:nth-child(3)').find('m-tcol-c').html());
            return new Article({
            id: parseInt($(el).children('td:nth-child(1)').text(),10),
            title: $(el).children('td:nth-child(2)').find('m-tcol-c').text(),
            username: $(el).children('td:nth-child(3)').find('m-tcol-c').text()//,
            //link: query(el).children('td:nth-child(3)').find('m-tcol-c').html()
            //userid: Number.parseInt(query(query(el).children('td:nth-child(3)').find('m-tcol-c')).attr('onclick').split(",")[1].split(",")[1])//
        })}).get();
        for(let article of articleList){
            console.log(article.username + "");
        }
    }
}

function genflag(input:number,...arg:Array<boolean>):number {
    const len = arg.length;
    for(let [i, flag] of Object.entries(arg)){
        const offset:number = len - Number.parseInt(i) - 1;
        if(flag){
            input |= (1 << offset);
        }else{
            input &= ~(1 << offset);
        }
    }
    return input;
}