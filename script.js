// ======================= نظام الحماية بكلمة مرور وصلاحية زمنية =======================
const CORRECT_PASSWORD = "alexandria@191075$";
const VALIDITY_DAYS = 30;

function checkAndUnlock() {
    const lockScreen = document.getElementById('lockScreen');
    const appContainer = document.getElementById('appContainer');
    const expiryInfo = document.getElementById('expiryInfo');
    const lockError = document.getElementById('lockError');

    let firstUseDateStr = localStorage.getItem('firstUseDate');
    let isUnlocked = localStorage.getItem('isUnlocked') === 'true';

    if (isUnlocked && firstUseDateStr) {
        const firstUseDate = new Date(firstUseDateStr);
        const now = new Date();
        const daysDiff = (now - firstUseDate) / (1000 * 60 * 60 * 24);
        if (daysDiff <= VALIDITY_DAYS) {
            lockScreen.style.display = 'none';
            appContainer.style.display = 'flex';
            initApp();
            return;
        } else {
            localStorage.removeItem('isUnlocked');
            localStorage.removeItem('firstUseDate');
            expiryInfo.innerText = `انتهت صلاحية التطبيق (أكثر من ${VALIDITY_DAYS} يوم). أدخل كلمة المرور لتجديد الصلاحية.`;
        }
    } else {
        expiryInfo.innerText = `هذا الجهاز غير مسجل. أدخل كلمة المرور لتفعيل التطبيق لمدة ${VALIDITY_DAYS} يوم.`;
    }

    lockScreen.style.display = 'flex';
    appContainer.style.display = 'none';
    lockError.innerText = '';
}

document.getElementById('unlockBtn').addEventListener('click', () => {
    const password = document.getElementById('passwordInput').value;
    const lockError = document.getElementById('lockError');
    const expiryInfo = document.getElementById('expiryInfo');

    if (password === CORRECT_PASSWORD) {
        const now = new Date();
        localStorage.setItem('firstUseDate', now.toISOString());
        localStorage.setItem('isUnlocked', 'true');
        checkAndUnlock();
    } else {
        lockError.innerText = '❌ كلمة المرور غير صحيحة. الوصول مرفوض.';
        expiryInfo.innerText = '';
    }
});

// ======================= المتغيرات العامة =======================
let originalImage = null;
let currentImage = null;
let batchFiles = [];
let activeBatchIndex = 0;
let picaInstance = pica();
let isDark = localStorage.getItem('darkMode') === 'true';
let svgString = null;

const beforeCanvas = document.getElementById('beforeCanvas');
const afterCanvas = document.getElementById('afterCanvas');
const ctxBefore = beforeCanvas.getContext('2d');
const ctxAfter = afterCanvas.getContext('2d');
const statusDiv = document.getElementById('statusMsgMain');
const statusSidebar = document.getElementById('statusMsg');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const gamutWarningDiv = document.getElementById('gamutWarning');
const recommendationsDiv = document.getElementById('recommendations');

function setProgress(percent, text) {
    if (percent <= 0 || percent >= 100) progressContainer.style.display = 'none';
    else progressContainer.style.display = 'flex';
    progressBar.style.width = percent + '%';
    progressText.innerText = text || `${percent}%`;
}

function updatePreviews() {
    if (originalImage) {
        beforeCanvas.width = originalImage.width;
        beforeCanvas.height = originalImage.height;
        ctxBefore.drawImage(originalImage, 0, 0);
    }
    if (currentImage) {
        afterCanvas.width = currentImage.width;
        afterCanvas.height = currentImage.height;
        ctxAfter.drawImage(currentImage, 0, 0);
    }
}

function setCurrentImage(img) {
    currentImage = img;
    updatePreviews();
    analyzeAndRecommend();
}

function setOriginalImage(img) {
    originalImage = img;
    currentImage = img;
    updatePreviews();
    analyzeAndRecommend();
}

// ======================= تحميل الملفات المتقدمة (PSD محسن، RAW أفضل، PDF، TIFF) =======================
async function loadAdvancedFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'psd') {
        try {
            const psd = await PSD.fromURL(URL.createObjectURL(file));
            // دمج جميع الطبقات في صورة PNG واحدة
            const pngData = psd.image.toPng();
            const img = new Image();
            await new Promise((resolve) => { img.onload = resolve; img.src = pngData; });
            return img;
        } catch(e) {
            statusSidebar.innerText = '⚠️ فشل تحميل PSD، يرجى التأكد من الملف.';
            throw e;
        }
    } else if (ext === 'raw') {
        try {
            // محاولة قراءة البيانات كصورة (معاينة أساسية)
            const buffer = await file.arrayBuffer();
            const blob = new Blob([buffer], {type: 'image/jpeg'});
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = URL.createObjectURL(blob);
            });
            statusSidebar.innerText = '⚠️ ملف RAW تم تحميله كمعاينة أساسية. قد لا تكون دقيقة 100%.';
            return img;
        } catch(e) {
            statusSidebar.innerText = '⚠️ فشل تحميل RAW. يرجى تحويل الملف إلى تنسيق آخر.';
            const dummy = new Image();
            dummy.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='gray'/%3E%3C/svg%3E";
            return dummy;
        }
    } else if (file.type === 'application/pdf') {
        const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const img = new Image();
        await new Promise((resolve) => { img.onload = resolve; img.src = canvas.toDataURL(); });
        return img;
    } else if (ext === 'tiff' || file.type === 'image/tiff') {
        const arrayBuffer = await file.arrayBuffer();
        const ifds = UTIF.decode(arrayBuffer);
        UTIF.decodeImage(arrayBuffer, ifds[0]);
        const rgba = UTIF.toRGBA8(ifds[0]);
        const canvas = document.createElement('canvas');
        canvas.width = ifds[0].width;
        canvas.height = ifds[0].height;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(ifds[0].width, ifds[0].height);
        imgData.data.set(rgba);
        ctx.putImageData(imgData, 0, 0);
        const img = new Image();
        await new Promise((resolve) => { img.onload = resolve; img.src = canvas.toDataURL(); });
        return img;
    } else {
        const img = new Image();
        await new Promise((resolve) => { img.onload = resolve; img.src = URL.createObjectURL(file); });
        return img;
    }
}

// ======================= رفع الملفات =======================
async function handleFiles(files) {
    batchFiles = Array.from(files);
    updateBatchList();
    for (let i = 0; i < batchFiles.length; i++) {
        setProgress((i / batchFiles.length) * 100, `تحميل ${batchFiles[i].name}`);
        try {
            const img = await loadAdvancedFile(batchFiles[i]);
            if (i === 0) setOriginalImage(img);
        } catch (e) {
            console.error(e);
            statusSidebar.innerHTML = `خطأ في تحميل ${batchFiles[i].name}`;
        }
    }
    setProgress(0, '');
    statusSidebar.innerHTML = `✅ تم رفع ${batchFiles.length} ملف.`;
    if (batchFiles.length > 0) activeBatchIndex = 0;
}

function updateBatchList() {
    const container = document.getElementById('batchList');
    container.innerHTML = batchFiles.map((f, idx) =>
        `<div class="batch-item ${idx === activeBatchIndex ? 'active' : ''}" data-index="${idx}">${f.name}</div>`
    ).join('');
    document.querySelectorAll('.batch-item').forEach(el => {
        el.addEventListener('click', async () => {
            activeBatchIndex = parseInt(el.dataset.index);
            const img = await loadAdvancedFile(batchFiles[activeBatchIndex]);
            setOriginalImage(img);
            updateBatchList();
        });
    });
}

// ======================= وظائف تحسين الجودة =======================
async function smartUpscale() {
    if (!currentImage) return;
    setProgress(30, 'تكبير ذكي ×2...');
    const canvasIn = document.createElement('canvas');
    canvasIn.width = currentImage.width;
    canvasIn.height = currentImage.height;
    canvasIn.getContext('2d').drawImage(currentImage, 0, 0);
    const outCanvas = document.createElement('canvas');
    outCanvas.width = currentImage.width * 2;
    outCanvas.height = currentImage.height * 2;
    await picaInstance.resize(canvasIn, outCanvas, { quality: 3, unsharpAmount: 70, unsharpRadius: 0.6 });
    const newImg = new Image();
    newImg.src = outCanvas.toDataURL();
    newImg.onload = () => setCurrentImage(newImg);
    setProgress(100, 'تم التكبير');
    setTimeout(() => setProgress(0, ''), 1000);
}

function bilateralDenoise() {
    if (!currentImage) return;
    setProgress(20, 'تقليل التشويش (Bilateral)...');
    const canvas = document.createElement('canvas');
    canvas.width = currentImage.width;
    canvas.height = currentImage.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(currentImage, 0, 0);
    let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let data = imgData.data;
    let width = canvas.width, height = canvas.height;
    let output = new Uint8ClampedArray(data.length);
    let sigmaS = 3, sigmaR = 30;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let i = y * width + x;
            let rSum = 0, gSum = 0, bSum = 0, wSum = 0;
            let centerR = data[i*4], centerG = data[i*4+1], centerB = data[i*4+2];
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    let nx = x + dx, ny = y + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        let j = ny * width + nx;
                        let pr = data[j*4], pg = data[j*4+1], pb = data[j*4+2];
                        let spatial = Math.exp(-(dx*dx + dy*dy) / (2*sigmaS*sigmaS));
                        let range = Math.exp(-((pr-centerR)*(pr-centerR) + (pg-centerG)*(pg-centerG) + (pb-centerB)*(pb-centerB)) / (2*sigmaR*sigmaR));
                        let weight = spatial * range;
                        rSum += pr * weight;
                        gSum += pg * weight;
                        bSum += pb * weight;
                        wSum += weight;
                    }
                }
            }
            if (wSum > 0) {
                output[i*4] = rSum / wSum;
                output[i*4+1] = gSum / wSum;
                output[i*4+2] = bSum / wSum;
            } else {
                output[i*4] = centerR;
                output[i*4+1] = centerG;
                output[i*4+2] = centerB;
            }
            output[i*4+3] = data[i*4+3];
        }
    }
    ctx.putImageData(new ImageData(output, width, height), 0, 0);
    const newImg = new Image();
    newImg.src = canvas.toDataURL();
    newImg.onload = () => { setCurrentImage(newImg); setProgress(100, 'تم تقليل التشويش'); setTimeout(()=>setProgress(0,''),1000); };
}

async function deblockEdgeAware() {
    if (!currentImage) return;
    setProgress(30, 'إزالة البكسلة...');
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = currentImage.width;
    tempCanvas.height = currentImage.height;
    tempCanvas.getContext('2d').drawImage(currentImage, 0, 0);
    const smallCanvas = document.createElement('canvas');
    const scale = 0.7;
    smallCanvas.width = Math.floor(currentImage.width * scale);
    smallCanvas.height = Math.floor(currentImage.height * scale);
    await picaInstance.resize(tempCanvas, smallCanvas, { quality: 3, alpha: true });
    const largeCanvas = document.createElement('canvas');
    largeCanvas.width = currentImage.width;
    largeCanvas.height = currentImage.height;
    await picaInstance.resize(smallCanvas, largeCanvas, { quality: 3, unsharpAmount: 60, unsharpRadius: 0.8 });
    const newImg = new Image();
    newImg.src = largeCanvas.toDataURL();
    newImg.onload = () => { setCurrentImage(newImg); setProgress(100, 'تمت إزالة البكسلة'); setTimeout(()=>setProgress(0,''),1000); };
}

function highPassSharpen() {
    if (!currentImage) return;
    setProgress(20, 'تحسين الحدة (High Pass)...');
    const canvas = document.createElement('canvas');
    canvas.width = currentImage.width;
    canvas.height = currentImage.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(currentImage, 0, 0);
    let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let data = imgData.data;
    let width = canvas.width, height = canvas.height;
    let blurred = new Uint8ClampedArray(data.length);
    for (let y = 1; y < height-1; y++) {
        for (let x = 1; x < width-1; x++) {
            let r=0,g=0,b=0,cnt=0;
            for (let dy=-1; dy<=1; dy++) {
                for (let dx=-1; dx<=1; dx++) {
                    let idx = ((y+dy)*width + (x+dx))*4;
                    r+=data[idx]; g+=data[idx+1]; b+=data[idx+2]; cnt++;
                }
            }
            let idxOut = (y*width + x)*4;
            blurred[idxOut] = r/cnt;
            blurred[idxOut+1] = g/cnt;
            blurred[idxOut+2] = b/cnt;
            blurred[idxOut+3] = data[idxOut+3];
        }
    }
    let amount = 1.2;
    for (let i=0; i<data.length; i+=4) {
        let highR = data[i] - blurred[i];
        let highG = data[i+1] - blurred[i+1];
        let highB = data[i+2] - blurred[i+2];
        data[i] = Math.min(255, Math.max(0, data[i] + amount * highR));
        data[i+1] = Math.min(255, Math.max(0, data[i+1] + amount * highG));
        data[i+2] = Math.min(255, Math.max(0, data[i+2] + amount * highB));
    }
    ctx.putImageData(imgData, 0, 0);
    const newImg = new Image();
    newImg.src = canvas.toDataURL();
    newImg.onload = () => { setCurrentImage(newImg); setProgress(100, 'تم تحسين الحدة'); setTimeout(()=>setProgress(0,''),1000); };
}

async function overallSuperEnhance() {
    if (!currentImage) return;
    setProgress(5, 'بدء التحسين الشامل...');
    let tempImg = currentImage;
    if (tempImg.width < 2000 && tempImg.height < 2000) {
        setProgress(15, 'تكبير ذكي...');
        const canvasIn = document.createElement('canvas');
        canvasIn.width = tempImg.width;
        canvasIn.height = tempImg.height;
        canvasIn.getContext('2d').drawImage(tempImg,0,0);
        const outCanvas = document.createElement('canvas');
        outCanvas.width = tempImg.width * 2;
        outCanvas.height = tempImg.height * 2;
        await picaInstance.resize(canvasIn, outCanvas, { quality: 3, unsharpAmount: 40 });
        tempImg = await new Promise(r => { let i=new Image(); i.onload=()=>r(i); i.src=outCanvas.toDataURL(); });
    }
    setProgress(35, 'تقليل التشويش...');
    const bilateralCanvas = document.createElement('canvas');
    bilateralCanvas.width = tempImg.width;
    bilateralCanvas.height = tempImg.height;
    let ctxB = bilateralCanvas.getContext('2d');
    ctxB.drawImage(tempImg, 0, 0);
    let imgData = ctxB.getImageData(0,0,bilateralCanvas.width,bilateralCanvas.height);
    let data = imgData.data;
    let width = bilateralCanvas.width, height = bilateralCanvas.height;
    let output = new Uint8ClampedArray(data.length);
    let sigmaS = 2.5, sigmaR = 25;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let i = y * width + x;
            let rSum=0,gSum=0,bSum=0,wSum=0;
            let cr=data[i*4], cg=data[i*4+1], cb=data[i*4+2];
            for (let dy=-2; dy<=2; dy++) {
                for (let dx=-2; dx<=2; dx++) {
                    let nx=x+dx, ny=y+dy;
                    if (nx>=0 && nx<width && ny>=0 && ny<height) {
                        let j = ny*width+nx;
                        let pr=data[j*4], pg=data[j*4+1], pb=data[j*4+2];
                        let spatial = Math.exp(-(dx*dx+dy*dy)/(2*sigmaS*sigmaS));
                        let range = Math.exp(-((pr-cr)*(pr-cr)+(pg-cg)*(pg-cg)+(pb-cb)*(pb-cb))/(2*sigmaR*sigmaR));
                        let w = spatial*range;
                        rSum+=pr*w; gSum+=pg*w; bSum+=pb*w; wSum+=w;
                    }
                }
            }
            if(wSum>0) { output[i*4]=rSum/wSum; output[i*4+1]=gSum/wSum; output[i*4+2]=bSum/wSum; }
            else { output[i*4]=cr; output[i*4+1]=cg; output[i*4+2]=cb; }
            output[i*4+3]=data[i*4+3];
        }
    }
    ctxB.putImageData(new ImageData(output,width,height),0,0);
    tempImg = await new Promise(r => { let i=new Image(); i.onload=()=>r(i); i.src=bilateralCanvas.toDataURL(); });
    setProgress(60, 'إزالة البكسلة...');
    const smallC = document.createElement('canvas');
    const scale = 0.85;
    smallC.width = Math.floor(tempImg.width * scale);
    smallC.height = Math.floor(tempImg.height * scale);
    const srcC = document.createElement('canvas');
    srcC.width = tempImg.width; srcC.height = tempImg.height;
    srcC.getContext('2d').drawImage(tempImg,0,0);
    await picaInstance.resize(srcC, smallC, {quality:3});
    const largeC = document.createElement('canvas');
    largeC.width = tempImg.width; largeC.height = tempImg.height;
    await picaInstance.resize(smallC, largeC, {quality:3, unsharpAmount: 40});
    tempImg = await new Promise(r => { let i=new Image(); i.onload=()=>r(i); i.src=largeC.toDataURL(); });
    setProgress(85, 'تحسين الحدة النهائي...');
    const sharpCanvas = document.createElement('canvas');
    sharpCanvas.width = tempImg.width;
    sharpCanvas.height = tempImg.height;
    const ctxSharp = sharpCanvas.getContext('2d');
    ctxSharp.drawImage(tempImg,0,0);
    let sharpData = ctxSharp.getImageData(0,0,sharpCanvas.width,sharpCanvas.height);
    let sData = sharpData.data;
    let sw = sharpCanvas.width, sh = sharpCanvas.height;
    let sBlurred = new Uint8ClampedArray(sData.length);
    for (let y=1; y<sh-1; y++) {
        for (let x=1; x<sw-1; x++) {
            let r=0,g=0,b=0, cnt=0;
            for (let dy=-1; dy<=1; dy++) {
                for (let dx=-1; dx<=1; dx++) {
                    let idx = ((y+dy)*sw + (x+dx))*4;
                    r+=sData[idx]; g+=sData[idx+1]; b+=sData[idx+2]; cnt++;
                }
            }
            let idxOut = (y*sw + x)*4;
            sBlurred[idxOut]=r/cnt; sBlurred[idxOut+1]=g/cnt; sBlurred[idxOut+2]=b/cnt;
            sBlurred[idxOut+3]=sData[idxOut+3];
        }
    }
    let amount = 0.9;
    for (let i=0; i<sData.length; i+=4) {
        let highR = sData[i] - sBlurred[i];
        let highG = sData[i+1] - sBlurred[i+1];
        let highB = sData[i+2] - sBlurred[i+2];
        sData[i] = Math.min(255, Math.max(0, sData[i] + amount * highR));
        sData[i+1] = Math.min(255, Math.max(0, sData[i+1] + amount * highG));
        sData[i+2] = Math.min(255, Math.max(0, sData[i+2] + amount * highB));
    }
    ctxSharp.putImageData(sharpData,0,0);
    const finalImg = new Image();
    finalImg.src = sharpCanvas.toDataURL();
    finalImg.onload = () => { setCurrentImage(finalImg); setProgress(100, 'اكتمل التحسين الشامل'); setTimeout(()=>setProgress(0,''),1500); };
}

async function removeBackground() {
    if (!currentImage) return;
    setProgress(30, 'تحميل نموذج BodyPix...');
    const net = await bodyPix.load();
    const canvas = document.createElement('canvas');
    canvas.width = currentImage.width;
    canvas.height = currentImage.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(currentImage, 0, 0);
    const segmentation = await net.segmentPerson(canvas);
    const mask = bodyPix.toMask(segmentation);
    const imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
    const maskData = mask.data;
    for(let i=0;i<imgData.data.length;i+=4) {
        if(maskData[i]===0 && maskData[i+1]===0 && maskData[i+2]===0) imgData.data[i+3]=0;
    }
    ctx.putImageData(imgData,0,0);
    const newImg = new Image();
    newImg.src = canvas.toDataURL();
    newImg.onload = () => setCurrentImage(newImg);
    setProgress(100, 'تمت الإزالة');
    setTimeout(()=>setProgress(0,''),1000);
}

async function upscaleToUHD() {
    if (!currentImage) return;
    let targetW = parseInt(document.getElementById('targetWidth').value);
    let targetH = parseInt(document.getElementById('targetHeight').value);
    if (isNaN(targetW) || isNaN(targetH) || targetW <= 0 || targetH <= 0) {
        statusDiv.innerHTML = "⚠️ الرجاء إدخال أبعاد مستهدفة صحيحة";
        return;
    }
    setProgress(10, `رفع الدقة إلى ${targetW}x${targetH}...`);
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = currentImage.width;
    srcCanvas.height = currentImage.height;
    srcCanvas.getContext('2d').drawImage(currentImage, 0, 0);
    const destCanvas = document.createElement('canvas');
    destCanvas.width = targetW;
    destCanvas.height = targetH;
    await picaInstance.resize(srcCanvas, destCanvas, {
        quality: 3,
        alpha: true,
        unsharpAmount: 90,
        unsharpRadius: 0.8,
        unsharpThreshold: 2
    });
    setProgress(70, 'تحسين الحدة النهائي...');
    const ctx = destCanvas.getContext('2d');
    let imgData = ctx.getImageData(0, 0, destCanvas.width, destCanvas.height);
    let data = imgData.data;
    let width = destCanvas.width, height = destCanvas.height;
    let blurred = new Uint8ClampedArray(data.length);
    for (let y = 1; y < height-1; y++) {
        for (let x = 1; x < width-1; x++) {
            let r=0,g=0,b=0,cnt=0;
            for (let dy=-1; dy<=1; dy++) {
                for (let dx=-1; dx<=1; dx++) {
                    let idx = ((y+dy)*width + (x+dx))*4;
                    r+=data[idx]; g+=data[idx+1]; b+=data[idx+2]; cnt++;
                }
            }
            let idxOut = (y*width + x)*4;
            blurred[idxOut] = r/cnt; blurred[idxOut+1] = g/cnt; blurred[idxOut+2] = b/cnt;
            blurred[idxOut+3] = data[idxOut+3];
        }
    }
    let amount = 0.7;
    for (let i=0; i<data.length; i+=4) {
        let highR = data[i] - blurred[i];
        let highG = data[i+1] - blurred[i+1];
        let highB = data[i+2] - blurred[i+2];
        data[i] = Math.min(255, Math.max(0, data[i] + amount * highR));
        data[i+1] = Math.min(255, Math.max(0, data[i+1] + amount * highG));
        data[i+2] = Math.min(255, Math.max(0, data[i+2] + amount * highB));
    }
    ctx.putImageData(imgData, 0, 0);
    const newImg = new Image();
    newImg.src = destCanvas.toDataURL();
    newImg.onload = () => {
        setCurrentImage(newImg);
        setProgress(100, `تم رفع الدقة إلى ${targetW}x${targetH}`);
        setTimeout(() => setProgress(0, ''), 1500);
        statusDiv.innerHTML = `✅ تم رفع الدقة: ${currentImage.width}x${currentImage.height} → ${newImg.width}x${newImg.height}`;
    };
}

function toCMYK() {
    if (!currentImage) return;
    const canvas = document.createElement('canvas');
    canvas.width = currentImage.width;
    canvas.height = currentImage.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(currentImage,0,0);
    let imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
    let data = imgData.data;
    let outOfGamut = 0;
    for(let i=0;i<data.length;i+=4){
        let r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255;
        const lab = chroma(data[i],data[i+1],data[i+2]).lab();
        if(lab[0] < 0 || lab[0] > 100) outOfGamut++;
        let k = 1-Math.max(r,g,b);
        let c = (1-r-k)/(1-k)||0;
        let m = (1-g-k)/(1-k)||0;
        let y = (1-b-k)/(1-k)||0;
        data[i]=c*255; data[i+1]=m*255; data[i+2]=y*255; data[i+3]=k*255;
    }
    ctx.putImageData(imgData,0,0);
    const newImg = new Image();
    newImg.src = canvas.toDataURL();
    newImg.onload = () => setCurrentImage(newImg);
    if(outOfGamut > data.length/400) gamutWarningDiv.innerText = '⚠️ تحذير: بعض الألوان خارج نطاق الطباعة (CMYK)';
    else gamutWarningDiv.innerText = '✅ الألوان ضمن نطاق الطباعة';
}

function resetImage() { if(originalImage) setCurrentImage(originalImage); }

function analyzeQuality() {
    if(!currentImage) return;
    const dpi = parseInt(document.getElementById('targetDPI').value);
    const wCm = parseFloat(document.getElementById('bannerWidthCm').value);
    const hCm = parseFloat(document.getElementById('bannerHeightCm').value);
    const reqW = wCm * (dpi/2.54), reqH = hCm * (dpi/2.54);
    const ratio = currentImage.width / reqW;
    const quality = ratio >= 1 ? 'ممتازة' : ratio > 0.7 ? 'جيدة' : 'ضعيفة';
    document.getElementById('qualityReport').innerHTML = `الدقة: ${currentImage.width}x${currentImage.height}<br>المطلوب: ${Math.round(reqW)}x${Math.round(reqH)}<br>الجودة: ${quality}`;
}

async function splitIntoTiles() {
    if(!currentImage) return;
    const dpi = parseInt(document.getElementById('targetDPI').value);
    const bannerW_cm = parseFloat(document.getElementById('bannerWidthCm').value);
    const bannerH_cm = parseFloat(document.getElementById('bannerHeightCm').value);
    const tileStr = document.getElementById('tileSizeCm').value;
    const overlap = parseFloat(document.getElementById('overlapCm').value);
    const watermark = document.getElementById('watermarkText').value;
    let [tileW_cm, tileH_cm] = tileStr.split('x').map(Number);
    const pxPerCm = dpi/2.54;
    const totalPxW = Math.round(bannerW_cm * pxPerCm);
    const totalPxH = Math.round(bannerH_cm * pxPerCm);
    const tilePxW = Math.round(tileW_cm * pxPerCm);
    const tilePxH = Math.round(tileH_cm * pxPerCm);
    const overlapPx = Math.round(overlap * pxPerCm);
    const stepX = tilePxW - overlapPx;
    const stepY = tilePxH - overlapPx;
    const cols = Math.ceil((totalPxW - overlapPx) / stepX);
    const rows = Math.ceil((totalPxH - overlapPx) / stepY);
    const zip = new JSZip();
    let workingCanvas = document.createElement('canvas');
    workingCanvas.width = totalPxW;
    workingCanvas.height = totalPxH;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = currentImage.width;
    tempCanvas.height = currentImage.height;
    tempCanvas.getContext('2d').drawImage(currentImage,0,0);
    await picaInstance.resize(tempCanvas, workingCanvas, {quality:3});
    for(let row=0; row<rows; row++){
        for(let col=0; col<cols; col++){
            let srcX = col*stepX, srcY=row*stepY;
            let srcW = tilePxW, srcH=tilePxH;
            if(srcX+srcW > totalPxW) srcW = totalPxW - srcX;
            if(srcY+srcH > totalPxH) srcH = totalPxH - srcY;
            const tileCanvas = document.createElement('canvas');
            tileCanvas.width = srcW;
            tileCanvas.height = srcH;
            const tCtx = tileCanvas.getContext('2d');
            tCtx.drawImage(workingCanvas, srcX, srcY, srcW, srcH, 0,0,srcW,srcH);
            tCtx.font = `bold ${Math.floor(srcW/25)}px 'Segoe UI'`;
            tCtx.fillStyle = '#ffffffc0';
            tCtx.fillText(`${watermark} - جزء ${row+1}-${col+1}`, 20, srcH-30);
            const blob = await new Promise(r => tileCanvas.toBlob(r, 'image/png'));
            zip.file(`tile_${row+1}_${col+1}.png`, blob);
        }
    }
    const content = await zip.generateAsync({type:"blob"});
    saveAs(content, `banner_tiles_${cols}x${rows}.zip`);
    statusDiv.innerHTML = `✅ تم تصدير ${cols*rows} قطعة.`;
}

async function exportTIFF() {
    const canvas = afterCanvas;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const tiff = UTIF.encodeImage({width:canvas.width, height:canvas.height, data:new Uint8Array(imgData.data.buffer)}, canvas.width, canvas.height);
    saveAs(new Blob([tiff], {type:"image/tiff"}), 'print_ready.tiff');
}
function exportPDF() {
    const { jsPDF } = window.jspdf;
    const imgData = afterCanvas.toDataURL('image/png');
    let pdf = new jsPDF({unit:'px', format:[afterCanvas.width, afterCanvas.height]});
    pdf.addImage(imgData, 'PNG', 0, 0, afterCanvas.width, afterCanvas.height);
    pdf.save('print_ready.pdf');
}
function exportPNG() { afterCanvas.toBlob(b => saveAs(b, 'print_ready.png'), 'image/png'); }
async function batchExportAll() {
    if(batchFiles.length===0) return;
    const zip = new JSZip();
    for(let i=0; i<batchFiles.length; i++){
        const img = await loadAdvancedFile(batchFiles[i]);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img,0,0);
        const blob = await new Promise(r=>canvas.toBlob(r,'image/png'));
        zip.file(`image_${i+1}.png`, blob);
    }
    const content = await zip.generateAsync({type:"blob"});
    saveAs(content, 'batch_export.zip');
}

// ======================= محرر مرئي =======================
document.getElementById('applyEditorBtn').onclick = () => {
    if(!currentImage) return;
    const canvas = document.createElement('canvas');
    canvas.width = currentImage.width;
    canvas.height = currentImage.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(currentImage, 0, 0);
    let imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
    let data = imgData.data;
    const contrast = (document.getElementById('contrastSlider').value - 100) / 100;
    const sharpness = (document.getElementById('sharpnessSlider').value - 100) / 100;
    const sat = document.getElementById('saturationSlider').value / 100;
    for(let i=0;i<data.length;i+=4){
        let r=data[i], g=data[i+1], b=data[i+2];
        r = 128 + (r-128)*(1+contrast);
        g = 128 + (g-128)*(1+contrast);
        b = 128 + (b-128)*(1+contrast);
        let gray = 0.299*r+0.587*g+0.114*b;
        r = gray + sat*(r-gray);
        g = gray + sat*(g-gray);
        b = gray + sat*(b-gray);
        data[i]=Math.min(255,Math.max(0,r));
        data[i+1]=Math.min(255,Math.max(0,g));
        data[i+2]=Math.min(255,Math.max(0,b));
    }
    if(sharpness !== 0) {
        let width = canvas.width, height = canvas.height;
        let srcData = new Uint8ClampedArray(data);
        let blurred = new Uint8ClampedArray(data.length);
        for (let y = 1; y < height-1; y++) {
            for (let x = 1; x < width-1; x++) {
                let r=0,g=0,b=0,cnt=0;
                for (let dy=-1; dy<=1; dy++) {
                    for (let dx=-1; dx<=1; dx++) {
                        let idx = ((y+dy)*width + (x+dx))*4;
                        r+=srcData[idx]; g+=srcData[idx+1]; b+=srcData[idx+2]; cnt++;
                    }
                }
                let idxOut = (y*width + x)*4;
                blurred[idxOut]=r/cnt; blurred[idxOut+1]=g/cnt; blurred[idxOut+2]=b/cnt;
            }
        }
        let amount = sharpness * 2;
        for (let i=0; i<data.length; i+=4) {
            data[i] = Math.min(255, Math.max(0, srcData[i] + amount * (srcData[i] - blurred[i])));
            data[i+1] = Math.min(255, Math.max(0, srcData[i+1] + amount * (srcData[i+1] - blurred[i+1])));
            data[i+2] = Math.min(255, Math.max(0, srcData[i+2] + amount * (srcData[i+2] - blurred[i+2])));
        }
    }
    ctx.putImageData(imgData,0,0);
    const newImg = new Image();
    newImg.src = canvas.toDataURL();
    newImg.onload = () => setCurrentImage(newImg);
};

// ======================= أدوات الرسم =======================
function addDrawing(type) {
    if(!currentImage) return;
    const canvas = document.createElement('canvas');
    canvas.width = currentImage.width;
    canvas.height = currentImage.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(currentImage, 0, 0);
    ctx.strokeStyle = '#ff0000';
    ctx.fillStyle = '#ff0000';
    ctx.lineWidth = 5;
    if(type === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(100, 100);
        ctx.lineTo(200, 200);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(200, 200);
        ctx.lineTo(180, 180);
        ctx.stroke();
        ctx.moveTo(200, 200);
        ctx.lineTo(180, 220);
        ctx.stroke();
    } else if(type === 'text') {
        ctx.font = '30px Arial';
        ctx.fillText('نص تجريبي', 50, 100);
    } else if(type === 'cutMark') {
        ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
    }
    const newImg = new Image();
    newImg.src = canvas.toDataURL();
    newImg.onload = () => setCurrentImage(newImg);
}
document.getElementById('addArrowBtn').onclick = () => addDrawing('arrow');
document.getElementById('addTextBtn').onclick = () => addDrawing('text');
document.getElementById('addCutMarkBtn').onclick = () => addDrawing('cutMark');

// ======================= حساب التكلفة المتطور =======================
document.getElementById('calcCostBtn').onclick = () => {
    const country = document.getElementById('countrySelect').value;
    const material = document.getElementById('materialSelect').value;
    const finish = document.getElementById('finishSelect').value;
    let area = parseFloat(document.getElementById('area').value);
    if(isNaN(area)) area = 0;
    
    let pricePerSqm = 0;
    if (material === 'قماش') pricePerSqm = parseFloat(document.getElementById('priceFabric').value);
    else if (material === 'فينيل') pricePerSqm = parseFloat(document.getElementById('priceVinyl').value);
    else if (material === 'ورق') pricePerSqm = parseFloat(document.getElementById('pricePaper').value);
    if(isNaN(pricePerSqm)) pricePerSqm = 0;
    
    let finishCost = (finish === 'لماع') ? 2 : 0;
    let total = (pricePerSqm + finishCost) * area;
    
    let currency = 'ريال';
    if (country.includes('مصر')) currency = 'جنيه مصري';
    else if (country.includes('السعودية')) currency = 'ريال سعودي';
    else if (country.includes('الإمارات')) currency = 'درهم إماراتي';
    else if (country.includes('الولايات المتحدة')) currency = 'دولار أمريكي';
    else if (country.includes('أوروبا')) currency = 'يورو';
    
    document.getElementById('costResult').innerHTML = `التكلفة التقريبية: ${total.toFixed(2)} ${currency}`;
};

// ======================= تكامل سحابي (وهمي) =======================
document.getElementById('sendToCloudBtn').onclick = () => {
    alert('تم إرسال الطلب إلى خدمة الطباعة (API وهمي). يمكنك استبدال الرابط الفعلي.');
};

// ======================= نظام توصيات ذكي =======================
function analyzeAndRecommend() {
    if(!currentImage) return;
    const w = currentImage.width;
    let msg = '';
    if(w < 2000) msg += '⚠️ الدقة منخفضة، يُوصى برفع الدقة إلى 4K. ';
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = currentImage.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(currentImage, 0, 0);
    const imgData = ctx.getImageData(0,0,w,currentImage.height);
    let noise = 0;
    for(let i=0; i<Math.min(1000, imgData.data.length); i+=4) {
        noise += Math.abs(imgData.data[i] - imgData.data[i+100]);
    }
    if(noise > 5000) msg += '🌫️ تشويش مرتفع، استخدم تقليل التشويش. ';
    recommendationsDiv.innerHTML = msg || '✅ الصورة بجودة جيدة.';
}

// ======================= IndexedDB لحفظ الإعدادات =======================
const dbRequest = indexedDB.open('PrintMasterDB', 1);
dbRequest.onupgradeneeded = () => {
    dbRequest.result.createObjectStore('settings');
};
function saveSetting(key, value) {
    const db = dbRequest.result;
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(value, key);
}
function loadSetting(key, defaultValue) {
    return new Promise((resolve) => {
        const db = dbRequest.result;
        const tx = db.transaction('settings', 'readonly');
        const req = tx.objectStore('settings').get(key);
        req.onsuccess = () => resolve(req.result !== undefined ? req.result : defaultValue);
    });
}

// ======================= الوضع المظلم =======================
function initDarkMode() {
    if(isDark) document.body.classList.add('dark');
    document.getElementById('darkModeToggle').checked = isDark;
    document.getElementById('darkModeToggle').onchange = (e) => {
        isDark = e.target.checked;
        localStorage.setItem('darkMode', isDark);
        document.body.classList.toggle('dark', isDark);
    };
}
document.getElementById('toggleSidebarBtn').onclick = () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
};

// ======================= سحب لتقسيم المعاينة =======================
let isDragging = false;
const divider = document.getElementById('splitDivider');
divider.addEventListener('mousedown', (e) => { isDragging = true; e.preventDefault(); });
window.addEventListener('mousemove', (e) => {
    if(!isDragging) return;
    const splitPreview = document.getElementById('splitPreview');
    const rect = splitPreview.getBoundingClientRect();
    const newWidth = e.clientX - rect.left;
    if(newWidth > 100 && newWidth < rect.width-100){
        document.querySelector('.split-left').style.flex = `0 0 ${newWidth}px`;
        document.querySelector('.split-right').style.flex = `1`;
    }
});
window.addEventListener('mouseup', () => isDragging = false);

// ======================= تحويل الصورة إلى SVG =======================
async function convertToSvg() {
    if (!currentImage) {
        statusDiv.innerHTML = "⚠️ لا توجد صورة لتحويلها إلى SVG";
        return;
    }
    setProgress(20, "جاري تحويل الصورة إلى SVG...");
    const previewContainer = document.getElementById('svgPreviewContainer');
    const previewDiv = document.getElementById('svgPreview');
    previewContainer.style.display = 'block';
    previewDiv.innerHTML = '<div class="badge">⏳ جاري المعالجة...</div>';
    try {
        if (typeof PotracePlus === 'undefined') throw new Error("مكتبة PotracePlus لم يتم تحميلها.");
        const options = {
            turnpolicy: "majority", turdsize: 2, optcurve: true, alphamax: 1,
            invert: 0, brightness: 1, contrast: 1, blur: 0,
            crop: true, optimize: true, addDimensions: true, toRelative: true, toShorthands: true, decimals: 2
        };
        const traced = await PotracePlus(currentImage, options);
        svgString = traced.svg;
        previewDiv.innerHTML = svgString;
        setProgress(100, "تم التحويل");
        statusDiv.innerHTML = "✅ تم تحويل الصورة إلى SVG بنجاح.";
        setTimeout(() => setProgress(0, ''), 1500);
    } catch (err) {
        previewDiv.innerHTML = `<div class="warning-badge">❌ فشل التحويل: ${err.message}</div>`;
        setProgress(0, '');
        statusDiv.innerHTML = `⚠️ خطأ في التحويل: ${err.message}`;
    }
}
function downloadSvgFile() {
    if (!svgString) { alert("لا يوجد SVG للتنزيل"); return; }
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    saveAs(blob, `vector_${Date.now()}.svg`);
}
document.getElementById('vectorizeSvgBtn').onclick = convertToSvg;
document.getElementById('downloadSvgBtn').onclick = downloadSvgFile;

// ======================= ربط الأزرار =======================
function bindButtons() {
    document.getElementById('removeBgBtn').onclick = removeBackground;
    document.getElementById('upscaleBtn').onclick = smartUpscale;
    document.getElementById('denoiseAdvancedBtn').onclick = bilateralDenoise;
    document.getElementById('deblockBtn').onclick = deblockEdgeAware;
    document.getElementById('sharpenProBtn').onclick = highPassSharpen;
    document.getElementById('enhanceOverallBtn').onclick = overallSuperEnhance;
    document.getElementById('upscaleToUHDBtn').onclick = upscaleToUHD;
    document.getElementById('cmykBtn').onclick = toCMYK;
    document.getElementById('resetBtn').onclick = resetImage;
    document.getElementById('analyzeQualityBtn').onclick = analyzeQuality;
    document.getElementById('splitTilesBtn').onclick = splitIntoTiles;
    document.getElementById('exportTIFFBtn').onclick = exportTIFF;
    document.getElementById('exportPDFBtn').onclick = exportPDF;
    document.getElementById('exportPNGBtn').onclick = exportPNG;
    document.getElementById('batchExportAllBtn').onclick = batchExportAll;
    document.getElementById('batchUploadBtn').onclick = () => document.getElementById('batchFileInput').click();
    document.getElementById('batchFileInput').onchange = (e) => handleFiles(e.target.files);
}

// ======================= تهيئة التطبيق =======================
function initApp() {
    bindButtons();
    initDarkMode();
    const dummyImg = new Image();
    dummyImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'%3E%3Crect width='600' height='400' fill='%232a2a3a'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23ffaa55' font-size='28'%3EPrintMaster Pro%3C/text%3E%3C/svg%3E";
    dummyImg.onload = () => setOriginalImage(dummyImg);
    loadSetting('lastDPI', 150).then(val => document.getElementById('targetDPI').value = val);
    document.getElementById('targetDPI').addEventListener('change', (e) => saveSetting('lastDPI', e.target.value));
    const dropZone = document.getElementById('dropZone');
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; });
    dropZone.addEventListener('dragleave', () => dropZone.style.borderColor = 'var(--border)');
    dropZone.addEventListener('drop', async (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); });
    statusSidebar.innerText = '✅ التطبيق جاهز - جميع الميزات متاحة';
}

window.addEventListener('DOMContentLoaded', () => {
    checkAndUnlock();
});
