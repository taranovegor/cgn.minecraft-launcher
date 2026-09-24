import { Server } from './server';
export interface Distribution {
    version: string;
    /**
     * Global settings for Discord Rich Presence.
     */
    discord?: {
        /**
         * Client ID for the Application registered with Discord.
         */
        clientId: string;
        /**
         * Tootltip for the smallImageKey.
         */
        smallImageText: string;
        /**
         * Name of the uploaded image for the small profile artwork.
         */
        smallImageKey: string;
        /**
         * Global defaults for the Discord status texts. Server level values
         * take precedence. All fields are optional and fall back to the
         * bundled language file.
         */
        waitingText?: string;
        stateText?: string;
        loadingText?: string;
        joiningText?: string;
        joinedText?: string;
    };
    /**
     * A URL to a RSS feed. Used for loading news.
     */
    rss: string;
    /**
     * Array of server objects.
     */
    servers: Server[];
}
