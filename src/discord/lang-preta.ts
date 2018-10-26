import hangul from 'hangul-js'
import Config from "../config"

export default class LangPreta extends Config {
    public valTrue = "ㅇ"
    public valFalse = "ㄴ"

    public nameString = "문자열"
    public nameNumber = "숫자"
    public nameBoolean = "논리"
    public valNull = "null"
    /*
     * Module: ping
     */
    public ping = {
        helpPing: "핑 날리는 거다냥!",
    }
    /*
     * Module: auth
     */
    public login = {
        naverId: "네이버 아이디",
        naverRequest: "%(type)s%(suffix)s 입력해달라냥~",
        naverAlreadyOn: "이미 %(id)s로 로그인이 이미 됐다냥!",
        naverOn: "로그인 됐다냥!",
        naverWrongPW: "아이디나 비번이 다르다냥!",
        naverReqCaptcha: "캡챠를 입력해달라냥..",
        naverOff: "안됐다냥!",
        passwordDelete: "비밀번호 보낸 거 삭제해달라냥!",
        successAdmin: "%(user)s님 관리자인걸 환영한다냥!",
        failAdmin_invalidToken: "토큰이 안맞다냥..",
        failAdmin_noToken: "멍청한 %(user)s야 토큰이 없다냥!",
    }
    /*
     * module: events
     */
    public events = {
        descWelcome: "환영 메세지를 설정한다냐~",
        descBotCh: "각종 이벤트를 기록한다냥.",
        typeWelcomeMsg: "환영 메세지를 입력해달라냐. %(name)s는 닉네임, %(mention)s는 멘션이다냐.",
        setWelcomeSuccess: "설정 완료! 다음은 예제다냥.",
        setBotCh: "봇 채널 설정 완료!",
        exitUser: "%(name)s님이 나갔다냐. ~~나가는 김에 죽어버령~~",
        changeNick: "닉네임이 바뀌었다냐.",
    }
    /*
     * Module: gather
     */
    public gather = {
        gatherDesc: "이리 와서 집결하세요!",
        removeDesc: "넌 이제 자유다.",
        setDefault: "대표 채널로 설정됐다냐~",
        addGather: "이 채널이 중계에 추가됐다냐.",
        removeGather: "이 채널이 중계에서 삭제됐다냐.",
    }
    /*
     * Module: auth
     */
    public auth = {
        authCmdDesc: "네이버 카페 회원인지 인증하는거다냥!",
        nickNotFound: "%(nick)s 회원을 찾을 수 없다냥..",
        noAuth: "%(nick)s 유저는 인증이 안되어 있다냥..",
        roomNotMaked: "방을 못만들었다냥! 실패다냥~",
        onlyGroup: "그룹만 사용할 수 있다냥!",
        proxyFailed: "인증용 채팅방이 존재하지 않는다냥.",
        authing: "이미 인증중이냥, 네카채를 확인해달라냥~",
        nccmessage: `%(user)s 님이 이 아이디로 디스코드 인증을 요청한다냥.
        %(link)s
        님이 보낸 요청이 맞다면 채팅을 쳐주거나 링크를 클릭해달라냥.
        주인님이 보낸 요청이 아니라면 나가달라냥.`,
        authed: "인증 완료다냥!",
        already_auth: "이미 인증 완료된 아이디다냐!",
        expiredAuth: "이미 유효 기간이 지났다냐.",
    }
    /*
     * Module: artinoti
     */
    public noti = {
        toggleDesc: "이 채널에서 알림 수신을 끄거나 킨다냥",
    }
    /*
     * Module: cast
     */
    public cast = {
        castDesc: "선택한 채널에 네이버 카페 채팅을 중계한다냐.",
        castParam: "네이버 카페 채팅(talk.~) 주소다냐",
        linkFail: "링크가 안맞다냐. https://talk.cafe.naver.com/channels/<숫자> 링크가 필요하다냐!",
        roomFail: "방을 찾을 수 없다냐!",
        webhookFail: "웹훅을 할 수 없다냐!",
        webhookSuccess: "웹훅 설정이 끝냤다냐!",
        sendImage: "이미지를 보냈다냐.",
        fallbackNick: "시스템 메세지다냐",
        optoutMessage: "<opt-out 된 회원의 메세지다냐>",
        readonly: "읽기 전용이다냐",
        authonly: "인증된 유저 전용이다냐",
        needNaver: "네이버 카페 이름이 필요하다냐",
    }
    /*
     * Module: sample
     */
    public sample = {
        hello: "안녕",
    }
    /**
     * Global..
     */
    public paramFew = "%(param)s 파라메터가 필요하다냥!"
    // help
    public helpTitle = "도움말이다냥!"
    public helpNoExists = "%(help)s 명령어는 없다냥!"
    public helpDesc = "도움말 그 자체"
    // set
    public setNotFound = "%(depth)s에서 %(name)s을 찾을 수 없어양!"
    public setTypeError = "%(depth)s의 타입이 %(type)s이당!"
    public setSuccess = "%(config)s의 %(key)s을 %(old)s에서 %(value)s%(to)s 설정했다냥!"
    // admin
    public sudoNeed = "관리자 명령어다냥!"
    public adminGranted = "%(mention)s님 인증완료."
    // notlogin
    public noNaver = "네이버 계정으로 로그인 안되어 있다냥.."

    constructor() {
        super("lang")
    }
    public getType(obj:any) {
        switch (typeof obj) {
            case "boolean": return this.nameBoolean
            case "function": return "Function"
            case "number": return this.nameNumber
            case "object": return "Object"
            case "string": return this.nameString
            case "symbol": return "Symbol"
            case "undefined" : return "Undefined"
        }
        throw new Error(".")
    }
}
