import type { Chat, User } from '../../types';
import { ChessGame } from './ChessGame';
import { ChessHome } from './ChessHome';

interface ChessScreenProps {
    currentUser: User;
    gameId: string | null;
    authToken: string | null;
    chats: Chat[];
    onOpenGame: (gameId: string) => void;
    onExitGame: () => void;
}

export function ChessScreen({
    currentUser,
    gameId,
    authToken,
    chats,
    onOpenGame,
    onExitGame,
}: ChessScreenProps) {
    if (gameId) {
        return (
            <ChessGame
                key={gameId}
                currentUser={currentUser}
                gameId={gameId}
                authToken={authToken}
                chats={chats}
                onExitGame={onExitGame}
            />
        );
    }
    return <ChessHome key="lobby" currentUser={currentUser} chats={chats} onOpenGame={onOpenGame} />;
}
