import caller from "caller"
import * as cheerio from "cheerio"
import * as encoding from "encoding"
import * as fs from 'fs-extra'
import get from "get-value"
import * as Entities from "html-entities"
import { Agent } from "https"
import * as querystring from "querystring"
import request from "request-promise-native"
import Cache from "../cache"
import Log from "../log"
import { CAFE_NICKNAME_CHECK, CAFE_PROFILE_UPDATE, CAFE_UPLOAD_FILE,
    cafePrefix, CHATAPI_MEMBER_SEARCH, mCafePrefix,
    naverRegex, whitelistDig } from "./ncconstant"
import { getFirst, parseFile, withName } from "./nccutil"
import NcCredent from "./ncredent"
import Article from "./structure/article"
import Cafe from "./structure/cafe"
import Comment from "./structure/comment"
import Profile from "./structure/profile"
import NcJson from "./talk/ncjson"
import uploadImage from "./talk/uploadphoto"
const userAgent = "Mozilla/5.0 (Node; NodeJS Runtime) Gecko/57.0 Firefox/57.0"
/**
 * Naver fetcher class using **jQuery**
 * 
 * @extends NcCredent
 */
export default class NcFetch extends NcCredent {
    protected parser = new Entities.AllHtmlEntities()
    private cacheDetail = new Map<number, Cache<Cafe>>()
    private cacheCafeID = new Map<string, Cache<number>>()
    private cacheNCMC4:Cache<string>
    private httpsAgent:Cache<Agent>
    constructor() {
        super()
        this.httpsAgent = Cache.fromGen((old) => {
            if (old != null) {
                old.destroy()
            }
            return new Agent({
                keepAlive: true
            })
        }, 60)
    }
    /**
     * Get Cheerio(jQuery) object from url
     * @param requrl URL request
     * @param param get parameter
     * @param option convert to EUC-KR / use cookie for auth
     * @returns jQuery
     * @deprecated use NCredit.
     */
    public async getWeb(requrl:string, param:{ [key:string]: string | number } = {},
            option = new RequestOption()):Promise<CheerioStatic> {
        /**
         * Check cookie status
         */
        const isNaver = naverRegex.test(requrl)
        if (option.useAuth && !await this.availableAsync()) {
            Log.w("ncc-getWeb",`${requrl}: ${!isNaver ? "Wrong url" : "Cookie error!"}`)
            return Promise.reject()
        }
        if (option.eucKR && option.type === SendType.POST && option.postdata != null) {
            // Legacy need
        } else {
            const reqBody = await this.credit.req(
                option.type, requrl, param, option.postdata, option.referer, option.eucKR ? "ms949" : "utf-8") as string
            return cheerio.load(reqBody)
        }
        /**
         * form data modification
         */
        let post_body = null
        if (option.type === SendType.POST) {
            post_body = querystring.stringify(option.postdata, "&", "=", { encodeURIComponent: (v) => v })
        }
        const encode = option.eucKR ? "euc-kr" : "utf-8"
        /**
         * Check keep-session need refresh
         */
        if (this.httpsAgent.expired) {
            this.httpsAgent.refresh()
        }
        /**
         * Make referer and options.
         */
        const options:request.RequestPromiseOptions | request.OptionsWithUrl = {
            method: option.type,
            url: requrl,
            qs: param,
            body: post_body,
            agent: this.httpsAgent.value,
            encoding: option.eucKR ? null : "utf-8",
            strictSSL: true,
            headers: {
                "Referer": option.referer,
                "content-type": (option.type === SendType.POST ? 
                    `application/x-www-form-urlencoded; charset=${encode}` : undefined),
                "User-Agent": userAgent,
            },
            jar: option.useAuth ? this.credit.reqCookie : false
        }
        // log url
        const query = querystring.stringify(options.qs, "&", "=")
        let from = caller()
        if (from != null) {
            from = from.substr(from.lastIndexOf("/") + 1)
        }
        Log.url("Fetch URL", requrl + ((query.length > 0) ? "?" + query : ""), from)
        let buffer:Buffer | string
        try {
            buffer = await request(options)
        } catch (err) {
            this.httpsAgent.refresh()
            return Promise.reject(err)
        }
        let body:string
        /**
         * Naver cafe uses euc-kr f***.
         */
        if (option.eucKR) {
            body = encoding.convert(buffer, "utf-8", "ms949").toString()
        } else {
            body = buffer as string
        }
        
        const cio = cheerio.load(body)
        return Promise.resolve(cio)
    }
    /**
     * 네이버 게시글 링크로 네이버 카페 정보를 받아옵니다.
     * @param purl 게시글 링크
     */
    public async parseNaver(purl:string):Promise<Cafe> {
        const cut = purl.match(/^https?:\/\/cafe\.naver\.com\/[A-Za-z0-9]+(\/)?/i)
        let cafename = ""
        if (cut != null) {
            purl = cut[0]
            const query = cut[0].match(/\/[A-Za-z0-9]+/ig)
            cafename = query[query.length - 1].substr(1)
        } else {
            return Promise.reject("Wrong url: " + purl)
        }
        let id:number
        // find cache
        if (this.cacheCafeID.has(cafename) && !this.cacheCafeID.get(cafename).expired) {
            id = this.cacheCafeID.get(cafename).cache
        } else {
            const $ = await this.getWeb(purl)
            const src = $("#main-area > script").html()
            id = Number.parseInt(src.match(/clubid=[0-9]+/m)[0].split("=")[1])
            this.cacheCafeID.set(cafename,new Cache(id, 86400))
        }
        return this.parseNaverDetail(id)
    }
    /**
     * 네이버 카페 ID로 네이버 카페 정보를 받아옵니다.
     * @param cafeid 네카페 숫자 ID
     */
    public async parseNaverDetail(cafeid:number):Promise<Cafe> {
        // check cache
        if (this.cacheDetail.has(cafeid) && !this.cacheDetail.get(cafeid).expired) {
            return this.cacheDetail.get(cafeid).cache
        }
        const url = `${cafePrefix}/CafeProfileView.nhn?clubid=${cafeid.toString(10)}`
        const $ = await this.getWeb(url)
        let members:string[] = $(".invite-padd02").map((index, element) => {
            const o = $(element)
            switch (index) {
                case 0:
                return o.text()
                case 1:
                return o.text()
                case 2:
                return o.find("img").length >= 1 ? o.find("img")[0].attribs["src"] : ""
                default: {
                    const query = o.text().match(/카페멤버\s+:\s+\d+/i)
                    if (query != null) {
                        return query[0].match(/\d+/i)[0]
                    }
                    return null
                }
            }
        }).get()
        // new skin
        if (members.length === 0) {
            members = $(".tbl_cafe_info > tbody > tr").map((index, element) => {
                const o = $(element).find("td")
                switch (index) {
                    case 0:
                    return o.find(".cafe_name").text()
                    case 1:
                    return o.text()
                    case 2:
                    return o.find("img").length >= 1 ? o.find("img")[0].attribs["src"] : ""
                    default: {
                        const query = o.text().match(/카페멤버\s+:\s+\d+/i)
                        if (query != null) {
                            return query[0].match(/\d+/i)[0]
                        }
                        return null
                    }
                }
            }).get()
        }
        members = members.filter((_v) => _v != null)
        const cafe = {
            cafeId: cafeid,
            cafeName: members[1].substr(members[1].lastIndexOf("/") + 1),
            cafeDesc: members[0].trim(),
            cafeImage: members[2].length <= 0 ? null : members[2],
            cafeUserCount: Number.parseInt(members[3])
        } as Cafe
        this.cacheDetail.set(cafeid, new Cache(cafe, 86400))
        return Promise.resolve(cafe)
    }
    /**
     * 최근 게시글 목록을 받아옵니다.(5개)
     * 자세한 정보는 담겨져 있지 않습니다.
     * @param cafeid 네이버 카페 ID
     * @param privateCafe 비공개 카페 여부
     */
    public async getRecentArticles(cafeid:number,privateCafe = false):Promise<Article[]> {
        const articlesURL = `${cafePrefix}/ArticleList.nhn`
        const params = {
            "search.clubid": cafeid.toString(),
            "search.boardtype": "L",
            "userDisplay": "5",
        }
        const opt = new RequestOption()
        opt.useAuth = privateCafe
        const $ = await this.getWeb(articlesURL, params, opt).catch(Log.e)
        if ($ == null) {
            return []
        }
        const articleList:Article[] = $('[name="ArticleList"] > table > tbody > tr:nth-child(2n+1)')
            .map((i, el) => { // console.log($(el).children('td:nth-child(3)').html());
                const clickscript:string = $(el).children("td:nth-child(3)").find(".m-tcol-c").attr("onclick")
                const arid:number = parseInt($(el).children("td:nth-child(1)").text(), 10)
                const cluburl = clickscript.split(",")[8].split("'")[1]
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
                } as Article
            }).get() as any
        return Promise.resolve<Article[]>(articleList)
    }
    /**
     * 게시글의 댓글들을 받아옵니다.
     * @param cafeid 네이버 카페 ID
     * @param articleid  게시물 ID (숫자)
     * @param orderNew 최신순으로 정렬
     */
    public async getComments(cafeid:number, articleid:number, orderNew = true):Promise<Comment[]> {
        const commentURL = `${mCafePrefix}/CommentView.nhn`
        const params = {
            "search.clubid": cafeid.toString(),
            "search.articleid": articleid.toString(),
            "search.orderby": orderNew ? "desc" : "asc",
        }
        const opt = new RequestOption()
        opt.eucKR = false
        const $ = await this.getWeb(commentURL, params, opt).catch(Log.e)
        if ($ == null) {
            return []
        }

        if ($("title").text().indexOf("로그인") >= 0) {
            Log.e("로그인이 안되어 있습니다.")
            return Promise.reject("로그인 안 됨")
        } else if ($(".error_content").length > 0) {
            Log.e($(".error_content_body h2").text())
            return Promise.reject($(".error_content_body h2").text())
        }
        // console.log( $('.u_cbox_comment').html());
        const comments:Comment[] = $(".u_cbox_comment").filter((i, el) => {
            return !$(el).hasClass("re")
        }).map((i, el) => {
            const author:any = $(el).find(".u_cbox_info_main").find("a")
            const reft:string = author.attr("href")
            const tstring:string = $(el).find(".u_cbox_date").text()

            const ymd:string[] = tstring.split(".")
            const hm:string[] = ymd[ymd.length - 1].split(":")

            let imgurl = null
            if ($(el).find(".u_cbox_image_wrap").length >= 1) {
                imgurl = this.orgURI($(el).find(".u_cbox_image_wrap").find("a").attr("class")
                .match(/(http|https):\/\/.+\)/i)[0])
            }

            let stickerurl = null
            if ($(el).find(".u_cbox_sticker_wrap").length >= 1) {
                stickerurl = $(el).find(".u_cbox_sticker_wrap").find("a").find("img").attr("src")
            }

            let profileurl = null
            if ($(el).find(".thumb").length >= 1) {
                profileurl = this.orgURI($(el).find(".thumb").find("img").attr("src"))
            }

            const time = {
                year: parseInt(ymd[0], 10),
                month: parseInt(ymd[1], 10) - 1,
                day: parseInt(ymd[2], 10),
                hour: parseInt(hm[0].substr(1), 10),
                minute: parseInt(hm[1], 10),
                offset: 3600 * 9 * 1000,
            }
            return {
                cafeId: cafeid,
                userid: reft.substring(reft.lastIndexOf("=") + 1),
                nickname: author.text(),
                content: $(el).find(".u_cbox_contents").text(),
                timestamp: new Date(time.year, time.month, time.day, time.hour, time.minute).getTime() - time.offset,
                imageurl: imgurl,
                stickerurl,
                profileurl,
            } as Comment
        }).get() as any

        for (const comment of comments) {
            Log.json("Comment", comment)
        }
        return Promise.resolve<Comment[]>(comments)
        // https://m.cafe.naver.com/CommentView.nhn?search.clubid=#cafeID&search.articleid=#artiID&search.orderby=desc";
    }
    /**
     * 게시글의 자세한 정보를 받아옵니다.
     * @param cafeid 네이버 카페 ID
     * @param articleid 게시글 ID
     */
    public async getArticleDetail(cafeid:number,articleid:number):Promise<Article> {
        const articleURL = `${cafePrefix}/ArticleRead.nhn`
        const params = {
            "clubid": cafeid.toString(),
            "articleid": articleid.toString(),
        }
        const comments = await this.getComments(cafeid,articleid,false)
        const $ = await this.getWeb(articleURL, params)
        if ($ == null) {
            return Promise.reject("Error")
        }

        const infos = $(".etc-box .p-nick a").attr("onclick").split(",")
        const link = $(".etc-box #linkUrl").text()
        const title = $(".tit-box span").text()
        // parse article names
        const tbody = $("#tbody")
        const contents = []
        const whitelist = ["img","iframe", "embed", "br"]
        tbody.children().map((i,el) => {
            const parsedContent = this.getTextsR(el, [])
            .filter((_el) => _el.data != null || whitelist.indexOf(_el.tagName) >= 0).map((value) => {
                if (whitelist.indexOf(value.tagName) >= 0) {
                    let type = "embed"
                    let data:any = value.attribs["src"]
                    if (value.tagName === "img") {
                        let width:number = -1
                        let height:number = -1
                        let style = value.attribs["style"]
                        if (style != null) {
                            style = style.replace(/\s+/ig, "")
                            const _w = style.match(/width:\s*\d+px/i)
                            if (_w != null) {
                                width = Number.parseInt(_w[0].match(/\d+/)[0])
                            }
                            const _h = style.match(/height:\s*\d+px/i)
                            if (_h != null) {
                                height = Number.parseInt(_h[0].match(/\d+/)[0])
                            }
                        } else {
                            const _w = value.attribs["width"]
                            const _h = value.attribs["height"]
                            if (_w != null && _w.indexOf("%") < 0) {
                                width = Number.parseInt(_w.trim())
                            }
                            if (_h != null && _h.indexOf("%") < 0) {
                                height = Number.parseInt(_h.trim())
                            }
                        }
                        if (Number.isNaN(width)) {
                            width = -1
                        }
                        if (Number.isNaN(height)) {
                            height = -1
                        }
                        type = "image"
                        data = {
                            src: value.attribs["src"],
                            width,
                            height,
                        }
                    } else if (value.tagName === "br") {
                        type = "newline"
                        data = "br"
                    }
                    if (data == null) {
                        data = ""
                    }
                    return {type,data:data.src, info:data}
                } else {
                    return {type:"text",data:value.data}
                }
            })
            .filter((value) => (value.type !== "text") || (value.data.replace(/\s+/igm, "").length >= 1))
            parsedContent.forEach((value) => contents.push(value))
            if (i >= 1 && parsedContent.filter((value) => value.type === "newline").length <= 0) {
                contents.push({type: "newline", data: "div"})
            }
        })
        const images = contents.filter((value) => value.type === "image")
        let image = null
        if (images.length >= 1) {
            images.sort((a, b) => Math.abs(b.info.width * b.info.width) - Math.abs(a.info.width * a.info.width))
            image = images[0].data
        }
        // name
        const _titles = this.parser.decode($("head").html()).match(/var cafeNameTitle =.+/ig)
        let titles:string = null
        if (_titles != null && _titles.length >= 1) {
            titles = _titles[0].substring(_titles[0].indexOf('"') + 1,_titles[0].lastIndexOf('"'))
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
        } as Article
        return Promise.resolve(out)
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
        const $ = await this.getWeb(`${cafePrefix}/CafeMemberNetworkView.nhn`, paramLevel)
        const cafe = await this.parseNaverDetail(cafeid)
        if ($ == null) {
            return Promise.reject("Error")
        }
        if ($(".m-tcol-c").text() === "탈퇴멤버") {
            return Promise.reject(`${userid} 아이디는 가입을 안했음`)
        }
        let nick = $(".ellipsis").text()
        // userid = nick.substring(nick.indexOf("(") + 1, nick.indexOf(")"));
        nick = nick.substring(0,nick.indexOf("("))
        if (nick.length <= 0) {
            return Promise.reject(`${userid} 아이디는 없음`)
        }
        const image = this.orgURI($(".thumb").find("img").attr("src"),false)
        const check = $(".m_info_area").find(".m-tcol-c")
        const level = $(check[0]).text().trim()
        const visit = Number.parseInt($(check[2]).find(".num").text())
        const article = Number.parseInt($(check[4]).find(".num").text())
        const comment = Number.parseInt($(check[6]).find(".num").text())
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
        } as Profile)
    }
    /**
     * 네이버 카페의 회원을 닉네임으로 검색하여 받아옵니다.
     * 없을 시 Promise.reject를 반환합니다.
     * 멤버 목록 비공개 카페도 검색 가능하며, ncc쪽을 씁니다.
     * @param cafeid 네이버 카페 ID
     * @param nickname 회원의 별명
     */
    public async getMemberByNick(cafeid:number, nickname:string) {
        let chainNick = nickname
        let profiles:Profile[]
        // due to naver api bug
        do {
            profiles = await this.queryMembersByNick(cafeid, chainNick)
            if (chainNick.length >= 1) {
                chainNick = chainNick.substring(0, chainNick.length - 1)
            }
        } while (profiles.length <= 0 && chainNick.length  >= 1)
        const real = profiles.filter((_v) => _v.nickname === nickname)
        if (real.length === 0) {
            return Promise.reject(`${nickname} 닉의 유저는 없음`)
        } else if (real.length >= 2) {
            real.splice(1,real.length - 1)
        }
        return this.getMemberById(cafeid, real[0].userid)
    }
    /**
     * 특정 네이버 카페의 **모든** 회원 목록을 가져옵니다.
     * 
     * **주의**) 매우 오래 걸립니다. *(22만개 13분)*
     * @param cafeid 네이버 카페 ID
     * @param limitation 최대 가져올 수
     */
    public async getALLMembers(cafeid:number, limitation = 1000000) {
        // http://cafe.naver.com/static/js/mycafe/javascript/nickNameValidationChk-1516327387000-7861.js
        const url = CHATAPI_MEMBER_SEARCH.get(cafeid)
        let memberList:Profile[] = []
        const perPage = 400
        const retries = 5
        const param = {
            page: 1,
            perPage,
        }
        const cafe = await this.parseNaverDetail(cafeid)
        if (cafe.cafeUserCount == null) {
            cafe.cafeUserCount = -1
        }
        const echo = 30000
        const start = Date.now()
        let date = Date.now()
        let req:object
        let tries = 0
        let looplist:object[]
        while (true) {
            req = JSON.parse(await this.credit.reqGet(url, param) as string)
            if (get(req, "message.status") !== "200") {
                Log.e(get(req, "message.error.msg"))
                if (tries > retries) {
                    memberList = []
                    break
                }
                tries += 1
                continue
            }
            looplist = get(req, "message.result.memberList") as object[]
            const ln = looplist.length
            let el
            for (let i = 0; i < ln; i += 1) {
                el = looplist[i]
                memberList.push({
                    cafeId: cafeid,
                    userid: el.memberId,
                    nickname: el.nickname,
                    profileurl: el.memberProfileImageUrl,
                })
            }
            if (ln < perPage || param.page * perPage >= limitation) {
                break
            }
            if (Date.now() - date >= echo) {
                const progress = param.page * perPage
                if (cafe.cafeUserCount > 0) {
                    Log.d("CafeMember-Fetch", `${progress}/${cafe.cafeUserCount} (${
                        Math.floor(progress / cafe.cafeUserCount * 100)
                    }%) (${Math.floor((Date.now() - start) / 1000)}s)`)
                } else {
                    Log.d("CafeMember-Fetch", `${progress} (${Math.floor((Date.now() - start) / 1000)}s)`)
                }
                date = Date.now()
            }
            tries = 0
            param.page += 1
        }
        return memberList
    }
    /**
     * Upload image to naver server
     * @param file File Path | File URL | File Buffer
     * @param filename FileName
     * @returns Image info / reject (if not logined or fail)
     */
    public async uploadImage(file:string | Buffer, filename?:string) {
        if (!await this.availableAsync()) {
            return Promise.reject("Not Logined")
        }
        return uploadImage(this.credit, file, filename)
    }
    public async fetchWatching(cafeid:number) {
        if (this.cacheNCMC4 == null || this.cacheNCMC4.expired) {
            if (!await this.availableAsync()) {
                return Promise.reject("Not Logined")
            }
            const str = await this.credit.reqGet("https://cafe.naver.com/sdbx") as string
            const first = getFirst(str.match(/.+ncmc4.+/ig))
            if (first == null) {
                return Promise.reject("Not Logined")
            }
            this.cacheNCMC4 = new Cache(first.substring(first.indexOf("\"") + 1, first.lastIndexOf("\"")), 3600)
        }
        const url = "https://lm02.cafe.naver.com/addAndList.nhn"
        const query = {
            "r": "linkedMember",
            "cafeKey": cafeid,
            "ncmc4": this.cacheNCMC4.value
        }
        const json = JSON.parse(await this.credit.reqGet(url, query) as string)
        const users:Array<{userid:string, name:string}> = []
        for (const obj of get(json, "l")) {
            users.push({
                userid: get(obj, "m"),
                name: get(obj, "n"),
            })
        }
        return users
    }
    /**
     * Change Nickname or image
     * @param cafeid Naver CafeID
     * @param nickname to change Nickname (null if u don't change)
     * @param image to change Image (null if u don't change)
     */
    public async changeProfile(cafeid:number | Cafe, nickname?:string, image?:string) {
        if (typeof cafeid !== "number") {
            cafeid = cafeid.cafeId
        }
        if (!await this.availableAsync()) {
            return Promise.resolve(null)
        }
        const uname = this.credit.username
        if (nickname == null || image == null) {
            const original = await this.getMemberById(cafeid, uname)
            if (nickname == null) {
                nickname = original.nickname
            }
            if (image == null) {
                image = original.profileurl
            }
        }
        const referer = `${cafePrefix}/CafeMemberInfo.nhn?clubid=${cafeid.toString()}&memberid=${uname}`
        // utf-8
        const usable_res = await this.credit.reqPost(CAFE_NICKNAME_CHECK, {}, {
            clubid: cafeid,
            memberid: uname,
            nickname,
        }, referer) as string
        try {
            const usable:boolean = get(JSON.parse(usable_res), "isUsable", {default: false})
            if (!usable) {
                return Promise.resolve(null)
            }
        } catch {
            return Promise.resolve(null)
        }
        const options = new RequestOption()
        options.eucKR = true
        options.type = SendType.POST
        options.useAuth = true
        options.referer = referer
        image = image.replace("https://cafethumb.pstatic.net" , "")
        options.postdata = {
            "clubid": cafeid,
            "memberid": this.credit.username,
            "personalInfoCollectAgree":false,
            "cafeProfileImageUrl": encodeURIComponent(image),
            "nickname": this.encodeURI_KR(nickname),
            "profileImageType": 1,
        }
        const $ = await this.getWeb(CAFE_PROFILE_UPDATE, {}, options)
        const t = $("body script").html().match(/'.*'/ig)
        return Promise.resolve(t[0])
    }
    /**
     * Query users using nick
     * @param cafeid CafeID
     * @param nick Nickname
     */
    protected async queryMembersByNick(cafeid:number,nick:string) {
        // http://cafe.naver.com/static/js/mycafe/javascript/nickNameValidationChk-1516327387000-7861.js
        const url = CHATAPI_MEMBER_SEARCH.get(cafeid)
        const param = {
            "page": 1,
            "perPage":10,
            "query": nick,
        }
        const memberList:Profile[] = []
        const req = await this.credit.reqGet(url, param)
        const query = new NcJson(req, (obj) => obj["memberList"] as TalkMember[])
        if (!query.valid) {
            return memberList
        }
        query.result.forEach((v) => memberList.push(({
            cafeId: cafeid,
            userid: v.memberId,
            nickname: v.nickname,
            profileurl: v.memberProfileImageUrl
        }) as Profile))
        return memberList
    }
    /**
     * Query string... at ('aa','bb','cc').split(",");
     * @param str string
     */
    private querystr(str:string):string {
        return str.substring(str.indexOf("'") + 1,str.lastIndexOf("'"))
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
            return null
        }
        str = str.replace(/\+/ig,"")
        if (str.indexOf("?") >= 0) {
            str = str.substring(0, str.lastIndexOf("?"))
        }
        return decode ? decodeURI(str) : str
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
                    arr = this.getTextsR(_el, arr)
                }
            }
        } else {
            arr.push(el)
        }
        return arr
    }
}
class RequestOption {
    public type:SendType = SendType.GET
    public postdata?:{[key:string]: string | number | boolean}
    public eucKR:boolean = true
    public useAuth:boolean = true
    public referer:string = `${cafePrefix}/`
}
interface TalkMember {
    memberId:string;
    maskingId:string;
    nickname:string;
    memberProfileImageUrl:string;
    manager:boolean;
    cafeMember:boolean;
    inviteeStatus:InviteeStatus;
    status:string;
}
interface InviteeStatus {
    inviteable:boolean;
    resultType:string;
    resultMessage:string;
}

enum SendType {
    GET = "GET",
    POST = "POST",
}