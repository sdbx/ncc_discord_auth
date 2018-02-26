package net.tarks.craftingmod.nccauth.discord;

public class DiscordUser {
    public String username;
    public long userID;
    public String cafeID;
    public int token;
    public long saidChannelID;
    public DiscordUser(long userID,long saidChannelID){
        this.userID = userID;
        this.cafeID = null;
        this.username = null;
        this.token = 0;
        this.saidChannelID = saidChannelID;
    }

    @Override
    public boolean equals(Object obj) {
       return (obj instanceof DiscordUser && ((DiscordUser) obj).userID == this.userID && ((DiscordUser)obj).token == this.token);
    }
}
