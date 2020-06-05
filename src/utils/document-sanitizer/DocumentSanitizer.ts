import fs = require('fs');
import { exec } from 'child_process';

import Jimp = require('jimp');

import { IDocumentSanitizer } from './IDocumentSanitizer';

const FILE_SIZE_LIMIT = 3 * 1024 * 1024;

export class DocumentSanitizer implements IDocumentSanitizer {
    async sanitize(input: string) {
        await this._sanitizeInternal(input, 0);
    }

    private async shrinkImage(input: string, ratio: number) {
        const image = await Jimp.read(input);
        await image.scale(ratio);
        await image.writeAsync(input);
    }

    private async shrinkPdf(input: string) {
        await new Promise((resolve, reject) => {
            // cspell:disable-next-line
            const command = `gs -q -dNOPAUSE -dQUIET -dBATCH -dSAFER -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen -dEmbedAllFonts=true -dSubsetFonts=true -dColorImageDownsampleType=/Bicubic -dColorImageResolution=70 -dGrayImageDownsampleType=/Bicubic -dGrayImageResolution=70 -dMonoImageDownsampleType=/Bicubic -dMonoImageResolution=70 -sOutputFile=${input}.tmp.pdf ${input}`;
            exec(command, (err, stdout, stderr) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        fs.copyFileSync(`${input}.tmp.pdf`, input);
        fs.unlinkSync(`${input}.tmp.pdf`);
    }

    private getFileSize(input: string) {
        const stats = fs.statSync(input);
        const fileSizeInBytes = stats.size;
        return fileSizeInBytes;
    }

    async _sanitizeInternal(input: string, retries: number) {
        if (retries > 5) {
            throw Error('Could not shrink document!');
        }

        const fileSize = this.getFileSize(input);
        if (fileSize < FILE_SIZE_LIMIT) {
            // file is ok, return it as it is
            return;
        }

        const lowered = input.toLowerCase();
        if (lowered.endsWith('.jpg') || lowered.endsWith('.jpeg') || lowered.endsWith('.png')) {
            // Shrink more than expected. Better chance to fit
            const ratio = (FILE_SIZE_LIMIT / fileSize) * 0.75;
            await this.shrinkImage(input, ratio);
            await this._sanitizeInternal(input, retries + 1);
        } else if (lowered.endsWith('.pdf')) {
            await this.shrinkPdf(input);
        } else {
            throw Error(`I don't know how to shrink "${input}"`);
        }
    }
}