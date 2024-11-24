const fs = require('fs');
const { Image } = require('image-js');

export async function generateLabeledImg(img, gaussianRadius, regionContourThreshold, floodFillThreshold, sharpenedThreshold, similarColorThreshold) {

    const [contour, contourRegion] = image2Edge(img, gaussianRadius, regionContourThreshold, sharpenedThreshold);

    const [regionColorsArray, numberedColors] = regionNumberedColor(img, contourRegion, floodFillThreshold, similarColorThreshold);


    return [contour, regionColorsArray, numberedColors];
}


function image2Edge(img, gaussianRadius, regionContourThreshold, sharpenedThreshold) {

    const kernel = [
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1]
    ];
    // Define the sharpening kernel
    const sharpenKernel = [
        [0, -1, 0],
        [-1, 5, -1],
        [0, -1, 0]
    ];


    const imgGrey = img.grey().gaussianFilter({ radius: 1, sigma: 1 });


    const imgDilated = imgGrey.dilate({ kernel });

    const imgDiff = imgDilated.subtract(imgGrey);
    const contourRegion = imgDiff.invert();

    const blurred = imgDiff.gaussianFilter({ radius: gaussianRadius });
    const diff = imgDiff.subtract(blurred);

    const sharpened = imgDiff.add(diff.multiply(2));
    const sharpenedDialated = sharpened.dilate({ kernel });
    sharpenedDialated.data.forEach((value, index) => {
        //contourTmp.data[index] = (value < 180) ? 0 : 255;
        sharpened.data[index] = (value < 20) ? 0 : sharpened.data[index];
    });

    const contour = sharpened.invert();
    // thresholding
    contour.data.forEach((value, index) => {
        //contour.data[index] = (value < 180) ? 0 : 255;
        //contourRegion.data[index] = (value < regionContourThreshold) ? 0 : 255;
    });
    return [contour, contourRegion];

}

function regionNumberedColor(img, contourRegion, floodFillThreshold, similarColorThreshold) {
    const regions = Array.from(colorRegions(contourRegion, floodFillThreshold));
    const regionColorsArray = [];
    for (let i = 0; i < regions.length; i++) {
        const regionColor = getRegionColor(img, regions[i]); regionColorsArray.push(regionColor);
    }
    mergeSimilarColors(regionColorsArray, similarColorThreshold);
    const numberedColors = setColorNumber(regionColorsArray);
    return [regionColorsArray, numberedColors];
}


function setColorNumber(inputArray) {
    const uniqueArrays = {};

    inputArray.forEach((array, index) => {
        const arrayString = JSON.stringify(array[1]);
        if (!uniqueArrays[arrayString]) {
            uniqueArrays[arrayString] = index;
        }
    });

    const result = {};
    let array_index = 1;
    Object.keys(uniqueArrays).forEach(arrayString => {
        result[arrayString] = array_index;
        array_index += 1;
    });

    return result;
}


function region2Array(region, width, height) {
    const regionArray = Array.from({ length: height }, () => Array(width).fill(0));

    region.forEach(index => {
        const x = index % width;
        const y = Math.floor(index / width);
        regionArray[y][x] = 1;
    });
    return regionArray;
}

function checkLabel(regionArray, locationX, locationY, labelWidth, labelHeight) {
    for (let j = 0; j <= labelHeight; j++) {
        for (let i = 0; i <= labelWidth; i++) {
            const coordX = locationX + i;
            const coordY = locationY + j;
            if (regionArray[coordY][coordX] !== 1) {
                return false;
            }
        }
    }
    return true;
}

function labelLocation(regionArray, labelSize) {
    const labelWidth = labelSize[0];
    const labelHeight = labelSize[1];
    const width = regionArray[0].length;
    const height = regionArray.length;
    for (let j = 0; j <= height - labelHeight; j++) {
        for (let i = 0; i <= width - labelWidth; i++) {
            if (checkLabel(regionArray, i, j, labelWidth, labelHeight)) {
                return [i, j];
            }
        }
    }
    return null;
}

function areColorsSimilar(color1, color2, threshold) {
    const [r1, g1, b1] = color1;
    const [r2, g2, b2] = color2;

    const diff = Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);

    return diff <= threshold;
}

function mergeSimilarColors(regionColorArray, similarColorThreshold) {
    for (let i = 0; i < regionColorArray.length; i++) {
        for (let j = i + 1; j < regionColorArray.length; j++) {
            if (areColorsSimilar(regionColorArray[i][1], regionColorArray[j][1], similarColorThreshold)) {
                regionColorArray[j][1] = regionColorArray[i][1];
            }
        }
    }
}


function getRegionColor(image, region) {
    const data = image.data;
    const regionArray = region2Array(region, image.width, image.height);
    const labelX = Math.floor(0.3 * Math.sqrt(region.length / Math.PI));
    const labelY = Math.floor(0.3 * Math.sqrt(region.length / Math.PI));
    const chosenIndex = labelLocation(regionArray, [labelX, labelY]);
    const chosenFlatIndex = chosenIndex !== null ? (image.width * chosenIndex[1] + chosenIndex[0]) : region.length / 2;
    if (image.channels === 3) {
        const r = data[chosenFlatIndex * 3];
        const g = data[chosenFlatIndex * 3 + 1];
        const b = data[chosenFlatIndex * 3 + 2];
        return [chosenFlatIndex, [r, g, b]];
    }
    else if (image.channels === 4) {
        const r = data[chosenFlatIndex * 4];
        const g = data[chosenFlatIndex * 4 + 1];
        const b = data[chosenFlatIndex * 4 + 2];
        const a = data[chosenFlatIndex * 4 + 3];
        return [chosenFlatIndex, [r, g, b, a]];
    }
    else if (image.channels === 1) {
        const g = data[chosenFlatIndex];
        return [chosenFlatIndex, [g]];
    }

}

function colorRegions(image, floodFillThreshold) {
    const regions = new Set();
    let region;
    const imageSize = image.width * image.height;
    for (let x = 0; x <= image.width; x++) {
        for (let y = 0; y <= image.height; y++) {
            region = floodFill(image, x, y, 255, 124, floodFillThreshold);
            if (region.length > 60) {
                regions.add(region);
            }
        }
    }
    return regions;
};

function floodFill(image, startX, startY, targetColor, replacementColor, tolerance = 0) {
    const width = image.width;
    const height = image.height;
    const data = image.data;
    const stack = [];
    const region = [];

    const getPixelIndex = (x, y) => y * width + x;
    const isOutOfBounds = (x, y) => x < 0 || y < 0 || x >= width || y >= height;
    const isColorMatch = (pixelIndex) => {
        const color = data[pixelIndex];
        return Math.abs(color - targetColor) <= tolerance;
    };

    let region_index = 0;
    const fillColor = (x, y) => {
        const pixelIndex = getPixelIndex(x, y);
        if (isOutOfBounds(x, y) || !isColorMatch(pixelIndex)) {
            return;
        }
        data[pixelIndex] = replacementColor;
        region[region_index] = pixelIndex;
        region_index += 1;
        stack.push([x, y]);
    };

    fillColor(startX, startY);

    while (stack.length) {
        const [x, y] = stack.pop();
        fillColor(x + 1, y);
        fillColor(x - 1, y);
        fillColor(x, y + 1);
        fillColor(x, y - 1);
    }
    return region;

}


async function main() {
    const srcPath = './OIP.jpeg';
    const destPath = 'output.svg';
    const img = await Image.load(srcPath);
    const imgConverted = generateLabeledSVG(img, 1, 1, 250, 12, 20);
    fs.writeFileSync(destPath, imgConverted);
}


//main();

