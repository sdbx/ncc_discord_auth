import * as hangul from 'hangul-js'
import Config from "../config"

export default class Lang extends Config {
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
        helpPing: "핑을 날려요",
    }
    /*
     * Module: auth
     */
    public login = {
        naverId: "네이버 아이디",
        naverRequest: "%(type)s%(suffix)s 입력해주세요.",
        naverAlreadyOn: "이미 %(id)s로 로그인이 되어 있습니다.",
        naverOn: "로그인 성공.",
        naverWrongPW: "아이디나 비번이 다릅니다.",
        naverReqCaptcha: "캡챠를 입력해주세요.",
        naverOff: "실패했습니다.",
        passwordDelete: "비밀번호 보낸 거 삭제해 주세요.",
        successAdmin: "%(user)s님은 이제 관리자입니다.",
        failAdmin_invalidToken: "토큰이 안맞습니다.",
        failAdmin_noToken: "token이 없습니다.",
        wrongOTPCodeType: "OTP코드의 형식이 맞지 않습니다. 8자리 숫자여야 합니다.",
        wrongOTPCode: "OTP코드가 맞지 않습니다. 다시 해주세요.",
        refreshing: "네이버 인증을 갱신하는 중입니다.",
        refreshSuccess: "네이버 인증을 갱신했습니다.",
        refreshFail: "네이버 인증 갱신을 실패했습니다.",
        descLogin: "봇을 위해 네이버 아이디로 로그인합니다.",
        descRefresh: "네이버 쿠키를 다시 만듭니다.",
    }
    /*
     * module: events
     */
    public events = {
        descWelcome: "환영 메세지를 설정합니다.",
        descBotCh: "각종 이벤트를 기록합니다.",
        typeWelcomeMsg: "환영 메세지를 입력해주세요. %(name)s는 닉네임, %(mention)s는 멘션입니다.",
        setWelcomeSuccess: "설정이 완료됐습니다. 예시)",
        setBotCh: "봇 채널 설정 완료!",
        exitUser: "%(name)s님이 나갔습니다.",
        changeNick: "닉네임이 바뀌었습니다.",
    }
    /*
     * Module: gather
     */
    public gather = {
        gatherDesc: "이리 와서 집결하세요!",
        removeDesc: "집결을 해제했습니다.",
        setDefault: "대표 채널로 설정했습니다.",
        addGather: "채널이 중계에 추가됐습니다.",
        removeGather: "채널이 중계에서 제거됐습니다.",
    }
    /*
     * Module: auth
     */
    public auth = {
        authCmdDesc: "네이버 카페 회원인지 인증합니다.",
        nickNotFound: "%(nick)s 회원을 찾을 수 없습니다.",
        noAuth: "%(nick)s 유저는 인증이 안되어 있습니다.",
        roomNotMaked: "방을 못 만들어서 실패했습니다.",
        onlyGroup: "그룹 채팅만 사용할 수 있습니다.",
        proxyFailed: "인증용 채팅방(프록시 채널)이 존재하지 않습니다.",
        authing: "이미 인증하는 중이니 네카채를 확인해주세요.",
        nccmessage: `%(user)s 님이 이 아이디로 디스코드 인증을 요청합니다.
        %(link)s
        보낸 요청이 맞다면 채팅을 쳐주거나 링크를 클릭해 주세요.
        봇은 잘못 인증한 것에 대한 책임을 지지 않습니다. :)`,
        warningID: "자신의 디코 아이디인지 확인해주세요.",
        authed: "인증 완료!",
        already_auth: "이미 인증 완료된 아이디입니다.",
        expiredAuth: "이미 유효 기간이 지났습니다.",
    }
    public color = {
        colorSuccess: "색상이 적용됐습니다.",
        wrongColor: "올바르지 않은 색상입니다! 6자리의 Hex값을 입력해주세요.",
        colorDesc: "알록달록하게 닉네임을 물들입니다.",
    }
    public purge = {
        noPerm: "봇에 권한이 없습니다.",
        deleting: "%(total)d개 삭제중",
        success: "삭제 완료.",
        noPermAll: "다른 사람의 메세지를 삭제할 권한이 없습니다.",
        fetchStart: "메세지 목록을 받아오고 있습니다. 기다려주세요.",
        fetchEnd: "메세지 목록 동기화가 완료됐습니다. 다시 입력해주세요.",
        purgeDesc: "싸악 삭제하기.",
        deletedMsg: "메세지를 삭제했습니다.",
        editedMsg: "메세지를 수정했습니다.",
        working: "진행중입니다.",
        fetching: "메세지 목록을 받아오고 있습니다.",
    }
    public perm = {
        noPermMangeRole: "Role을 관리하는 권한이 없습니다.",
        selected: "선택됨",
    }
    /*
     * Module: artinoti
     */
    public noti = {
        toggleDesc: "네이버 카페의 새 게시글을 이 채널로 알려줍니다.",
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
        sendImage: "이미지를 보냈습니다.",
        fallbackNick: "시스템 메세지입니다.",
        optoutMessage: "<opt-out 된 회원의 메세지입니다>",
        readonly: "읽기 전용입니다.",
        authonly: "인증된 유저 전용입니다.",
        needNaver: "네이버 카페 이름이 필요합니다.",
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
    public paramFew = "%(param)s 파라메터가 필요합니다."
    // help
    public helpTitle = "도움말"
    public helpNoExists = "%(help)s 명령어는 없습니다."
    public helpDesc = "도움말이에요~"
    // set
    public setNotFound = "%(depth)s에서 %(name)s을 찾을 수 없어요."
    public setTypeError = "%(depth)s의 타입은 %(type)s입니다."
    public setSuccess = "%(config)s의 %(key)s을 %(old)s에서 %(value)s%(to)s 설정했습니다."
    // admin
    public sudoNeed = "관리자 명령어입니다."
    public adminGranted = "%(mention)s님 인증완료."
    // notlogin
    public noNaver = "네이버 계정으로 로그인 안되어 있습니다."
    // chain end
    public chainEnd = "기존 실행중인 명령어가 취소되었습니다."

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
