import { Asset } from './Asset';
/**
 * Download progress reported while streaming a file.
 */
export interface Progress {
    percent: number;
    transferred: number;
    total: number;
}
export declare function getExpectedDownloadSize(assets: Asset[]): number;
export declare function downloadQueue(assets: Asset[], onProgress: (received: number) => void): Promise<{
    [id: string]: number;
}>;
export declare function downloadFile(url: string, path: string, onProgress?: (progress: Progress) => void): Promise<void>;
