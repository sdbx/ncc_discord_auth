import * as cheerio from "cheerio";
import * as encoding from "encoding";
import * as Entities from "html-entities";
import { Agent } from "https";
import * as querystring from "querystring";
import * as request from "request-promise-native";
import Cache from "../cache";
import Log from "../log";
import Article from "../structure/article";
import Cafe from "../structure/cafe";
import Comment from "../structure/comment";
import Profile from "../structure/profile";
import { cafePrefix, mCafePrefix, whitelistDig } from "./ncconstant";
import NcCredent from "./ncredent";
const userAgent = "Mozilla/5.0 (Node; NodeJS Runtime) Gecko/57.0 Firefox/57.0";
export default class NcFetch extends NcCredent {
    protected parser = new Entities.AllHtmlEntities();
    private cacheDetail = new Map<number, Cache<Cafe>>();
    private cacheCafeID = new Map<string, Cache<number>>();
    private httpsAgent = new Agent({
        keepAlive: true
    });
    constructor() {
        super();
    }
    /**
     * Get Cheerio(jquery) object from url
     * @returns jQuery
     * @param requrl URL request
     * @param param get parameter
     * @param option convert to EUC-KR / use cookie for auth
     */
    public async getWeb(requrl:string, param:{ [key:string]: string | number } = {},
            option = new RequestOption()):Promise<CheerioStatic> {
        /**
         * Check cookie status
         */
        const isNaver = new RegExp(/^(http|https):\/\/[A-Za-z0-9\.]*naver\.com\//, "gm").test(requrl);
        if (option.useAuth && (!isNaver || !await this.availableAsync())) {
            Log.w("ncc-getWeb",`${requrl}: ${isNaver ? "Wrong url" : "Cookie error!"}`);
            return Promise.reject();
        }
        /**
         * Copy tough-cookie to request-cookie
         */
        const cookie = request.jar();
        if (option.useAuth) {
            for (const url of ["https://nid.naver.com", "https://naver.com"]) {
                await new Promise<void>((res, rej) => {
                    this.credit.cookieJar.getCookies(url, (err, cookies) => {
                        if (err) {
                            rej(err);
                        } else {
                            cookies.forEach((value) => {
                                cookie.setCookie(value.toString(), url);
                            });
                            res();
                        }
                    });
                });
            }
        }
        /**
         * form data modification
         */
        let post_body = null;
        if (option.type === SendType.POST) {
            post_body = encoding.convert(
                querystring.stringify(option.postdata, "&", "=", { encodeURIComponent: (v) => v }), "utf-8");
        }
        const encode = option.eucKR ? "euc-kr" : "utf-8"
        /**
         * Make referer and options.
         */
        const options:request.RequestPromiseOptions | request.OptionsWithUrl = {
            method: option.type,
            url: requrl,
            qs: param,
            body: post_body,
            agent: this.httpsAgent,
            encoding: option.eucKR ? null : "utf-8",
            strictSSL: true,
            headers: {
                "Referer": option.referer,
                "content-type": (option.type === SendType.POST ? 
                    `application/x-www-form-urlencoded; charset=${encode}` : undefined),
                "User-Agent": userAgent,
            },
            jar: option.useAuth ? cookie : false
        }
        // log url
        const query = querystring.stringify(options.qs, "&", "=");
        Log.i("Fetch URL", requrl + "?" + query);
        Log.time();
        const buffer:Buffer | string = await request(options);
        
        let body:string;
        /**
         * Naver cafe uses euc-kr f***.
         */
        if (option.eucKR) {
            body = encoding.convert(buffer, "utf-8", "ms949").toString();
        } else {
            body = buffer as string;
        }
        
        const cio = cheerio.load(body);
        Log.time("Req");
        return Promise.resolve(cio);
    }
    /**
     * 네이버 게시글 링크로 네이버 카페 정보를 받아옵니다.
     * @param purl 게시글 링크
     */
    public async parseNaver(purl:string):Promise<Cafe> {
        const cut = purl.match(/^https?:\/\/cafe\.naver\.com\/[A-Za-z0-9]+(\/)?/i);
        let cafename = "";
        if (cut != null) {
            purl = cut[0];
            const query = cut[0].match(/\/[A-Za-z0-9]+/ig);
            cafename = query[query.length - 1].substr(1);
        } else {
            return Promise.reject("Wrong url: " + purl);
        }
        let id:number;
        // find cache
        if (this.cacheCafeID.has(cafename) && !this.cacheCafeID.get(cafename).expired) {
            id = this.cacheCafeID.get(cafename).cache;
        } else {
            const $ = await this.getWeb(purl);
            const src = $("#main-area > script").html();
            id = Number.parseInt(src.match(/clubid=[0-9]+/m)[0].split("=")[1]);
            this.cacheCafeID.set(cafename,new Cache(id, 86400));
        }
        return this.parseNaverDetail(id);
    }
    /**
     * 네이버 카페 ID로 네이버 카페 정보를 받아옵니다.
     * @param cafeid 네카페 숫자 ID
     */
    public async parseNaverDetail(cafeid:number):Promise<Cafe> {
        // check cache
        if (this.cacheDetail.has(cafeid) && !this.cacheDetail.get(cafeid).expired) {
            return this.cacheDetail.get(cafeid).cache;
        }
        const url = `${cafePrefix}/CafeProfileView.nhn?clubid=${cafeid.toString(10)}`;
        const $ = await this.getWeb(url);
        let members:string[] = $(".invite-padd02").map((index, element) => {
            const o = $(element);
            switch (index) {
                case 0:
                return o.text();
                case 1:
                return o.text();
                case 2:
                return o.find("img").length >= 1 ? o.find("img")[0].attribs["src"] : "";
                default:
                return null;
            }
        }).get();
        members = members.filter((_v) => _v != null);
        const cafe = {
            cafeId: cafeid,
            cafeName: members[1].substr(members[1].lastIndexOf("/") + 1),
            cafeDesc: members[0].trim(),
            cafeImage: members[2].length <= 0 ? null : members[2],
        } as Cafe;
        this.cacheDetail.set(cafeid, new Cache(cafe, 86400));
        return Promise.resolve(cafe);
    }
    /**
     * 최근 게시글 목록을 받아옵니다.(5개)
     * 자세한 정보는 담겨져 있지 않습니다.
     * @param cafeid 네이버 카페 ID
     * @param privateCafe 비공개 카페 여부
     */
    public async getRecentArticles(cafeid:number,privateCafe = false):Promise<Article[]> {
        const articlesURL = `${cafePrefix}/ArticleList.nhn`;
        const params = {
            "search.clubid": cafeid.toString(),
            "search.boardtype": "L",
            "userDisplay": "5",
        };
        const opt = new RequestOption();
        opt.useAuth = privateCafe;
        const $ = await this.getWeb(articlesURL, params, opt);
        const articleList:Article[] = $('[name="ArticleList"] > table > tbody > tr:nth-child(2n+1)')
            .map((i, el) => { // console.log($(el).children('td:nth-child(3)').html());
                const clickscript:string = $(el).children("td:nth-child(3)").find(".m-tcol-c").attr("onclick");
                const arid:number = parseInt($(el).children("td:nth-child(1)").text(), 10);
                const cluburl = clickscript.split(",")[8].split("'")[1];
                return {
                    articleId: arid,
                    articleTitle: $(el).children("td:nth-child(2)").find(".m-tcol-c").text(),
                    userName: $(el).children("td:nth-child(3)").find(".m-tcol-c").text(),
                    url: `${cafePrefix}/${cluburl}/${arid}`,
                    userId: clickscript.split(",")[1].split("\'")[1],
                    flags: {
                        file: $(el).find(".list-i-upload").length > 0,
                        image: $(el).find(".list-i-img").length > 0,
                        video: $(el).find(".list-i-movie").length > 0,
                        question: $(el).find(".list-i-poll").length > 0,
                        vote: $(el).find(".ico-q").length > 0,
                    },
                    cafeId: cafeid,
                    cafeName: cluburl,
                } as Article;
            }).get() as any;
        return Promise.resolve<Article[]>(articleList);
    }
    /**
     * 게시글의 댓글들을 받아옵니다.
     * @param cafeid 네이버 카페 ID
     * @param articleid  게시물 ID (숫자)
     * @param orderNew 최신순으로 정렬
     */
    public async getComments(cafeid:number, articleid:number, orderNew = true):Promise<Comment[]> {
        const commentURL = `${mCafePrefix}/CommentView.nhn`;
        const params = {
            "search.clubid": cafeid.toString(),
            "search.articleid": articleid.toString(),
            "search.orderby": orderNew ? "desc" : "asc",
        };
        const opt = new RequestOption();
        opt.eucKR = false;
        const $ = await this.getWeb(commentURL, params, opt);
        if ($ == null) {
            return Promise.reject("Error");
        }

        if ($("title").text().indexOf("로그인") >= 0) {
            Log.e("로그인이 안되어 있습니다.");
            return Promise.reject("로그인 안 됨");
        } else if ($(".error_content").length > 0) {
            Log.e($(".error_content_body h2").text());
            return Promise.reject($(".error_content_body h2").text());
        }
        // console.log( $('.u_cbox_comment').html());
        const comments:Comment[] = $(".u_cbox_comment").filter((i, el) => {
            return !$(el).hasClass("re");
        }).map((i, el) => {
            const author:any = $(el).find(".u_cbox_info_main").find("a");
            const reft:string = author.attr("href");
            const tstring:string = $(el).find(".u_cbox_date").text();

            const ymd:string[] = tstring.split(".");
            const hm:string[] = ymd[ymd.length - 1].split(":");

            let imgurl = null;
            if ($(el).find(".u_cbox_image_wrap").length >= 1) {
                imgurl = this.orgURI($(el).find(".u_cbox_image_wrap").find("a").attr("class")
                .match(/(http|https):\/\/.+\)/i)[0]);
            }

            let stickerurl = null;
            if ($(el).find(".u_cbox_sticker_wrap").length >= 1) {
                stickerurl = $(el).find(".u_cbox_sticker_wrap").find("a").find("img").attr("src");
            }

            let profileurl = null;
            if ($(el).find(".thumb").length >= 1) {
                profileurl = this.orgURI($(el).find(".thumb").find("img").attr("src"));
            }

            const time = {
                year: parseInt(ymd[0], 10),
                month: parseInt(ymd[1], 10) - 1,
                day: parseInt(ymd[2], 10),
                hour: parseInt(hm[0].substr(1), 10),
                minute: parseInt(hm[1], 10),
                offset: 3600 * 9 * 1000,
            };
            return {
                cafeId: cafeid,
                userid: reft.substring(reft.lastIndexOf("=") + 1),
                nickname: author.text(),
                content: $(el).find(".u_cbox_contents").text(),
                timestamp: new Date(time.year, time.month, time.day, time.hour, time.minute).getTime() - time.offset,
                imageurl: imgurl,
                stickerurl,
                profileurl,
            } as Comment;
        }).get() as any;

        for (const comment of comments) {
            Log.json("Comment", comment);
        }
        return Promise.resolve<Comment[]>(comments);
        // https://m.cafe.naver.com/CommentView.nhn?search.clubid=#cafeID&search.articleid=#artiID&search.orderby=desc";
    }
    /**
     * 게시글의 자세한 정보를 받아옵니다.
     * @param cafeid 네이버 카페 ID
     * @param articleid 게시글 ID
     */
    public async getArticleDetail(cafeid:number,articleid:number):Promise<Article> {
        const articleURL = `${cafePrefix}/ArticleRead.nhn`;
        const params = {
            "clubid": cafeid.toString(),
            "articleid": articleid.toString(),
        };
        const comments = await this.getComments(cafeid,articleid,false);
        const $ = await this.getWeb(articleURL, params);
        if ($ == null) {
            return Promise.reject("Error");
        }

        const infos = $(".etc-box .p-nick a").attr("onclick").split(",");
        const link = $(".etc-box #linkUrl").text();
        const title = $(".tit-box span").text();
        // parse article names
        const tbody = $("#tbody");
        const contents = [];
        const whitelist = ["img","iframe", "embed", "br"];
        tbody.children().map((i,el) => {
            const parsedContent = this.getTextsR(el, [])
            .filter((_el) => _el.data != null || whitelist.indexOf(_el.tagName) >= 0).map((value) => {
                if (whitelist.indexOf(value.tagName) >= 0) {
                    let type = "embed";
                    let data = value.attribs["src"];
                    if (value.tagName === "img") {
                        type = "image";
                    }else if (value.tagName === "br") {
                        type = "newline";
                        data = "br";
                    }
                    if (data == null) {
                        data = "";
                    }
                    return {type,data};
                } else {
                    return {type:"text",data:value.data};
                }
            })
            .filter((value) => (value.type !== "text") || (value.data.replace(/\s+/igm, "").length >= 1));
            parsedContent.forEach((value) => contents.push(value));
            if (i >= 1 && parsedContent.filter((value) => value.type === "newline").length <= 0) {
                contents.push({type: "newline", data: "div"});
            }
        });
        const images = contents.filter((value) => value.type === "image");
        let image = null;
        if (images.length >= 1) {
            image = images[0].data;
        }
        // name
        const _titles = this.parser.decode($("head").html()).match(/var cafeNameTitle =.+/ig);
        let titles:string = null;
        if (_titles != null && _titles.length >= 1) {
            titles = _titles[0].substring(_titles[0].indexOf('"') + 1,_titles[0].lastIndexOf('"'));
        }

        const out = {
            cafeId: Number.parseInt(this.querystr(infos[4])),
            cafeName: link.substring(link.indexOf("/") + 1, link.lastIndexOf("/")),
            cafeDesc: titles,
            articleId: Number.parseInt(link.substr(link.lastIndexOf("/") + 1)),
            articleTitle: title,
            flags: {
                file: false,
                image: images.length >= 1,
                video: false,
                question: false,
                vote: false,
            },
            userName: this.querystr(infos[3]),
            userId: this.querystr(infos[1]),
            url: link,
            comments,
            contents,
            imageURL: image,
        } as Article;
        return Promise.resolve(out);
        // https://cafe.naver.com/ArticleRead.nhn?clubid=26686242&
        // page=1&boardtype=L&articleid=7446&referrerAllArticles=true
    }
    /**
     * 네이버 카페의 회원을 네이버 ID로 검색하여 받아옵니다.
     * 없을 시 Promise.reject를 반환합니다.
     * @param cafeid 네이버 카페 ID
     * @param userid 회원의 네이버 아이디
     */
    public async getMemberById(cafeid:number,userid:string):Promise<Profile> {
        const paramLevel = {
            "m": "view",
            "clubid": cafeid.toString(10),
            "memberid": userid,
        }
        const $ = await this.getWeb(`${cafePrefix}/CafeMemberNetworkView.nhn`, paramLevel);
        const cafe = await this.parseNaverDetail(cafeid);
        if ($ == null) {
            return Promise.reject("Error");
        }
        if ($(".m-tcol-c").text() === "탈퇴멤버") {
            return Promise.reject(`${userid} 아이디는 가입을 안했음`);
        }
        let nick = $(".ellipsis").text();
        // userid = nick.substring(nick.indexOf("(") + 1, nick.indexOf(")"));
        nick = nick.substring(0,nick.indexOf("("));
        if (nick.length <= 0) {
            return Promise.reject(`${userid} 아이디는 없음`);
        }
        const image = this.orgURI($(".thumb").find("img").attr("src"),false);
        const check = $(".m_info_area").find(".m-tcol-c");
        const level = $(check[0]).text().trim();
        const visit = Number.parseInt($(check[2]).find(".num").text());
        const article = Number.parseInt($(check[4]).find(".num").text());
        const comment = Number.parseInt($(check[6]).find(".num").text());
        return Promise.resolve({
            profileurl:image,
            nickname: nick,
            userid,
            cafeId:cafeid,
            cafeDesc: cafe.cafeDesc,
            cafeImage: cafe.cafeImage,
            cafeName: cafe.cafeName,
            numArticles:article,
            numVisits: visit,
            numComments : comment,
            level,
        } as Profile);
    }
    /**
     * 네이버 카페의 회원을 닉네임으로 검색하여 받아옵니다.
     * 없을 시 Promise.reject를 반환합니다.
     * 멤버 목록 비공개 카페도 검색 가능하며, ncc쪽을 씁니다.
     * @param cafeid 네이버 카페 ID
     * @param nickname 회원의 별명
     */
    public async getMemberByNick(cafeid:number, nickname:string) {
        const profiles = await this.queryMemberByNick(cafeid,nickname);
        const real = profiles.filter((_v) => _v.nickname === nickname);
        if (real.length === 0) {
            return Promise.reject(`${nickname} 닉의 유저는 없음`);
        } else if (real.length >= 2) {
            real.splice(1,real.length - 1);
        }
        return this.getMemberById(cafeid, real[0].userid);
    }
    /**
     * 닉네임 검색
     */
    protected async queryMemberByNick(cafeid:number,nick:string) {
        // http://cafe.naver.com/static/js/mycafe/javascript/nickNameValidationChk-1516327387000-7861.js
        const param = {
            "_callback": "window.__naver_garbege_callback._$1234_0",
            "q": nick,
            "q_enc": "UTF-8",
            "st": 100,
            "frm": "test",
            "r_format": "json",
            "r_enc": "UTF-8", // I love utf-8
            "r_unicode": 0, // ?
            "t_koreng": 1, // ?
            "cafeId": cafeid,
            "memberId": this.username,
            "cmd": 1000010,
        }
        const opt = new RequestOption();
        opt.eucKR = false;
        opt.referer = "https://chat.cafe.naver.com/ChatHome.nhn";
        const $ = await this.getWeb("https://chat.cafe.naver.com/api/CafeMemberSearchAjax.nhn", param, opt);
        const memberList:Profile[] = [];
        const ids = $("body").text().match(/\{\s+"id"[\S\s]+?\}/igm);
        if (ids != null) {
            ids.forEach((json:string) => {
                try {
                    const data = JSON.parse(json);
                    memberList.push({
                        cafeId: cafeid,
                        userid: data["id"],
                        nickname: data["nickname"],
                        profileurl: data["profileImage"],
                    } as Profile);
                } catch (err) {
                    Log.e(err);
                }
            });
        }
        return Promise.resolve(memberList);
    }
    /**
     * Query string... at ('aa','bb','cc').split(",");
     * @param str string
     */
    private querystr(str:string):string {
        return str.substring(str.indexOf("'") + 1,str.lastIndexOf("'"));
    }
    /**
     * f*ck euc-kr, naver.
     * @param str 
     */
    private encodeURI_KR(str:string):string {
        return encoding.convert(str, "euc-kr").toString("hex").replace(/([a-f0-9]{2})/g, "%$1").toUpperCase()
    }
    private orgURI(str:string,decode = false):string {
        if (str == null) {
            return null;
        }
        str = str.replace(/\+/ig,"");
        if (str.indexOf("?") >= 0) {
            str = str.substring(0, str.lastIndexOf("?"));
        }
        return decode ? decodeURI(str) : str;
    }
    /**
     * get "no child" elements 
     * @param el $
     * @param arr init []
     */
    private getTextsR(el:CheerioElement,arr:CheerioElement[] = []):CheerioElement[] {
        if (el.children != null && el.children.length >= 1) {
            for (const _el of el.children) {
                if (whitelistDig.indexOf(el.tagName) >= 0) {
                    arr = this.getTextsR(_el, arr);
                }
            }
        } else {
            arr.push(el);
        }
        return arr;
    }
}
class RequestOption {
    public type:SendType = SendType.GET;
    public postdata?:{[key:string]: string | number };
    public eucKR:boolean = true;
    public useAuth:boolean = true;
    public referer:string = `${cafePrefix}/`;
}
enum SendType {
    GET = "GET",
    POST = "POST",
}