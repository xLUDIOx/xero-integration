import fs = require('fs');
import { exec } from 'child_process';

import Jimp = require('jimp');
import { IDocumentSanitizer } from './IDocumentSanitizer';

// const FILE_SIZE_LIMIT = 3 * 1024 * 1024;
const FILE_SIZE_LIMIT = 1024;

export class DocumentSanitizer implements IDocumentSanitizer {
    async sanitize(input: string) {
        const fileSize = this.getFileSize(input);
        if (fileSize < FILE_SIZE_LIMIT) {
            // file is ok, return it as it is
            return;
        }

        // Shrink a bit more than the actual scale differnce to compensate for non-linear resize of compressed files.
        const ratio = (FILE_SIZE_LIMIT / fileSize) * 0.75;
        const lowered = input.toLowerCase();
        if (lowered.endsWith('.jpg') || lowered.endsWith('.jpeg') || lowered.endsWith('.png')) {
            await this.shrinkImage(input, ratio);
        } else if (lowered.endsWith('.pdf')) {
            await this.shrinkPdf(input);
        } else {
            throw Error(`I don't know how to shrink "${input}"`);
        }
    }

    private async shrinkImage(input: string, ratio: number) {
        const image = await Jimp.read(input);
        await image.scale(ratio);
        await image.writeAsync(input);
    }

    private async shrinkPdf(input: string) {
        await new Promise((resolve, reject) => {
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
}
