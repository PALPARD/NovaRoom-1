export interface User {
    chatId: string;
    username: string;
    name: string;
    bio: string;
    avatar: string;
    online: boolean;
    lastSeen?: number | string | null;
    lastSeenCategory?: 'recently' | 'within_week' | 'within_month' | 'long_time_ago' | null;
    hideOnlineStatus?: boolean;
    verified?: boolean;
    registrationDate?: string;
}

export interface MessageReply {
    id: string;
    senderId: string;
    text: string;
}

export interface PinnedMessage {
    id: string;
    senderId: string;
    senderName?: string;
    text: string;
    timestamp: number;
    file?: FileMetadata;
    pinnedBy?: string;
    pinnedAt?: number;
}

export interface MessageReaction {
    userId: string;
    emoji: string;
}

export interface ForwardedFrom {
    originalSenderId: string;
    originalSenderName?: string;
    name?: string;
    username?: string;
}

export interface FileMetadata {
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    uploadedAt: string;
    title?: string;
    artist?: string;
    coverArtUrl?: string;
    coverArtFileId?: string;
    previewUrl?: string;
    previewFileId?: string;
}

export interface Message {
    id: string;
    clientId?: string;
    chatId: string;
    senderId: string;
    text: string;
    timestamp: number;
    seen: boolean;
    deliveryStatus?: 'sending' | 'sent';
    replyTo?: MessageReply;
    edited?: boolean;
    reactions?: MessageReaction[];
    forwardedFrom?: ForwardedFrom;
    file?: FileMetadata;
    reasoningContent?: string;
    reasoningEnabled?: boolean;
    isStreaming?: boolean;
    streamCompleted?: boolean;
    reasoningDurationSec?: number;
    aiModelKey?: AIModelKey;
    aiModelName?: string;
}

export interface ChatLastMessage {
    id?: string;
    text: string;
    senderId: string;
    
    timestamp: number;
    file?: FileMetadata;
}

export type PendingForwardDraft = {
    sourceChatId: string;
    messageId: string;
    messageIds?: string[];
    sourceChatName?: string;
    previewText?: string;
    previewFile?: FileMetadata | null;
};

export interface Chat {
    otherUser: any;
    id: string;
    participantIds: string[];
    chatType?: 'direct' | 'group';
    lastMessage?: ChatLastMessage | null;
    pinnedMessage?: PinnedMessage | null;
    unreadCount: number;
}

export interface AIChatSummary {
    id: string;
    title: string;
    summary?: string;
    updatedAt: number;
}

export type AIModelKey = 'nova-flash' | 'nova-pro';

export type View = 'chatList' | 'chatRoom' | 'newChat' | 'profile' | 'profileEdit' | 'settings' | 'settingsDevices' | 'settingsTheme' | 'settingsLogs' | 'settingsDataStorage' | 'settingsPrivacy';
