import * as cheerio from 'cheerio';
import * as encoding from 'encoding';
import * as request from 'request-promise-native';
import * as Long from 'long';

const articleURL:string = "http://cafe.naver.com/ArticleList.nhn";
const commentURL:string = "https://m.cafe.naver.com/CommentView.nhn";

export class Article {
    public static readonly FLAG_FILE:number = 0b10000;
    public static readonly FLAG_IMAGE:number = 0b1000;
    public static readonly FLAG_VIDEO:number = 0b100;
    public static readonly FLAG_QUESTION:number = 0b10;
    public static readonly FLAG_VOTE:number = 0b1;

    public id:number; // int, article id
    public title:string; // article title
    public flags:number; // int, (file,image,video,question,vote)
    public username:string;
    public userid:string; // real user identifier
    public link:URL; // url
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
}
export class Comment {
    public content:string;
    public userid:string;
    public nickname:string;
    public timestamp:number;

    public constructor(con:any){
        this.content = con.content;
        this.userid = con.userid;
        this.nickname = con.nickname;
        this.timestamp = (con.timestamp == null) ? Date.now() : con.timestamp;
    }
    public getTimeDiffer(){
        return new Date().getTime() - this.timestamp;
    }
}

export module fetcher {
    async function getWeb(requrl:string,param:object,convert:boolean=false) {
        let buffer = await request({
            url: requrl,
            qs: param,
            encoding: null
        });
        let body:string;
        if(convert){
            body = encoding.convert(buffer, "utf-8","euc-kr").toString();
        }else{
            body = buffer;
        }
        return cheerio.load(body);
    }
    export async function getArticles(cafeid:Number):Promise<Array<Article>> {
        let params:Object = {
            'search.clubid':cafeid.toString(),
            'search.boardtype':"L",
            'userDisplay':"5"
        }
        let $:any = await getWeb(articleURL,params,true);
        
        let articleList:Array<Article> = $('[name="ArticleList"] > table > tbody > tr:nth-child(2n+1)')
        .map((i, el) => { //console.log($(el).children('td:nth-child(3)').html());
            let clickscript:string = $(el).children('td:nth-child(3)').find('.m-tcol-c').attr('onclick');
            let arid:number = parseInt($(el).children('td:nth-child(1)').text(),10);
            return new Article({
            id: arid,
            title: $(el).children('td:nth-child(2)').find('.m-tcol-c').text(),
            username: $(el).children('td:nth-child(3)').find('.m-tcol-c').text(),
            link: "http://cafe.naver.com/" + clickscript.split(",")[8].split("'")[1] + "/" + arid,
            userid: clickscript.split(",")[1].split("\'")[1],
            flags: Article.flag(
                $(el).find(".list-i-upload").length > 0,
                $(el).find(".list-i-img").length > 0,
                $(el).find(".list-i-movie").length > 0,
                $(el).find(".list-i-poll").length > 0,
                $(el).find(".ico-q").length > 0)
        })}).get();
        for(let article of articleList){
            console.log(article.id + " / " + article.title + " / " + article.username + " / " + article.link + " / " + article.userid);
        }
        return Promise.resolve<Array<Article>>(articleList);
        /*
        return new Promise<Array<Article>>((resolve) => {
            resolve(articleList);
        });
        */
    }
    export async function getComments(cafeid:number,articleid:number):Promise<Array<Comment>>{
        let params:Object = {
            'search.clubid':cafeid.toString(),
            'search.articleid':articleid.toString(),
            'search.orderby':"desc"
        }
        let $:any = await getWeb(commentURL,params);

        if($("title").text().indexOf("로그인") >= 0){
            console.log("네이버 게시물을 전체 공개로 해주세요.");
            return Promise.reject("Memeber_open");
        }
        //console.log( $('.u_cbox_comment').html());
        let comments:Array<Comment> = $('.u_cbox_comment').filter((i,el) => {
            return !$(el).hasClass("re");
        }).map((i,el) => {
            let author:any = $(el).find(".u_cbox_info_main").find("a");
            let reft:string = author.attr("href");
            let tstring:string = $(el).find(".u_cbox_date").text(); 

            let ymd:Array<string> = tstring.split(".");
            let hm:Array<string> = ymd[ymd.length-1].split(":");
            return new Comment({
                userid:reft.substring(reft.lastIndexOf("=")+1),
                nickname:author.text(),
                content:$(el).find(".u_cbox_contents").text(),
                timestamp:new Date(parseInt(ymd[0]),parseInt(ymd[1])-1,parseInt(ymd[2]),parseInt(hm[0].substr(1)),parseInt(hm[1])).getTime()-32400000
            });
        }).get();

        for(let comment of comments){
            console.log(comment.userid + " / " + comment.nickname + " / " + comment.content + " / " + comment.timestamp);
        }

        return Promise.resolve<Array<Comment>>(comments);
        // https://m.cafe.naver.com/CommentView.nhn?search.clubid=#cafeID&search.articleid=#artiID&search.orderby=desc";
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