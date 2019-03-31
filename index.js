document.addEventListener("DOMContentLoaded", () => {
  // HTMLエレメント
  var buttonCamera = document.getElementById("buttonCamera");
  var buttonFile = document.getElementById("buttonFile");
  var buttonSample = document.getElementById("buttonSample");
  var inputFile = document.getElementById("inputFile");
  var status = document.getElementById("status");
  var progress = document.getElementById("progress");
  var sectionDetection = document.getElementById("sectionDetection");
  var detectionImage = document.getElementById("detectionImage");
  var detectionVideo = document.getElementById("detectionVideo");
  var detectionOverlay = document.getElementById("detectionOverlay");
  var divSampleSource = document.getElementById("divSampleSource");
  var sampleSource = document.getElementById("sampleSource");
  var divDetectionButton = document.getElementById("divDetectionButton");
  var detectionOK = document.getElementById("detectionOK");
  var detectionCancel = document.getElementById("detectionCancel");
  var sectionAveraging = document.getElementById("sectionAveraging");
  var averageCanvas = document.getElementById("averageCanvas");
  var averageSelector = document.getElementById("averageSelector");
  var averageOriginal = document.getElementById("averageOriginal");
  var divLog = document.getElementById("divLog");
  var background = document.getElementById("background");

  function log(message) {
    status.textContent = message;

    var div = document.createElement("div");
    div.textContent = message;
    divLog.appendChild(div);
  }

  var useWebGL = location.search.search("nowebgl") < 0;
  if (useWebGL) {
    background.href = "?nowebgl";
    background.textContent = "WebGL → CPU";
  } else {
    background.href = ".";
    background.textContent = "CPU → WebGL";
  }

  // 0: 0%, 1: 進行中, 2: 100%
  function changeProgress(p) {
    if (p==1) {
      progress.classList.remove("determinate");
      progress.classList.add("indeterminate");
    } else {
      progress.classList.remove("indeterminate");
      progress.classList.add("determinate");
    }
    if (p==0)
      progress.style.width = "0";
    else
      progress.style.width = "100%";
  }

  // フェイストラッキング
  var ctrack = new clm.tracker({useWebGL: useWebGL});
  ctrack.init();
  // 0: トラッキング無し
  // 1: 画像用にトラッキング中
  // 2: 動画用にトラッキング中
  var trackingMode = 0;
  var lastPosition;

  function initialize() {
    status.textContent = "Initialized";
    changeProgress(0);
    sectionDetection.style.display = "none";
    detectionImage.style.display = "none";
    detectionVideo.style.display = "none";
    divSampleSource.style.display = "none";
    divDetectionButton.style.display = "none";
    sectionAveraging.style.display = "none";
    divLog.innerHTML = "";
  }
  initialize()

  function disableButton() {
    buttonCamera.disabled = true;
    buttonFile.disabled = true;
    buttonSample.disabled = true;
  }

  function enableButton() {
    buttonCamera.disabled = false;
    buttonFile.disabled = false;
    buttonSample.disabled = false;
  }

  // カメラから画像を読みこみ
  var videoStream;

  buttonCamera.addEventListener("click", e => {
    e.preventDefault();

    if (!navigator.mediaDevices) {
      log("カメラに対応していないブラウザです");
      return;
    }

    navigator.mediaDevices.getUserMedia({video: {facingMode: "user"}})
      .catch(e => {
        log(`カメラからの映像取得に失敗しました（${e.name}: ${e.message}）`);
      })
      .then(s => {
        videoStream = s;
        detectionVideo.srcObject = videoStream;
        detectionVideo.onloadedmetadata = e => {
          initialize();
          disableButton();
          log("Face detecting");
          changeProgress(1);

          detectionVideo.play();

          // 幅も高さも320px以下になるように表示を縮小
          var w = detectionVideo.videoWidth;
          var h = detectionVideo.videoHeight;
          if (w>h && w>320) {
            h *= 320/w;
            w = 320;
          } else if (h>320) {
            w *= 320/h;
            h = 320;
          }
          w |= 0
          h |= 0
          detectionVideo.style.width = w+"px";
          detectionVideo.style.height = h+"px";
          detectionVideo.cssWidth = w;
          detectionVideo.cssHeight = h;
          detectionOverlay.width = w;
          detectionOverlay.height = h;

          // これを設定しておかないとclmtrackrがエラーになる
          detectionVideo.width = detectionVideo.videoWidth;
          detectionVideo.height = detectionVideo.videoHeight

          sectionDetection.style.display = "block";
          detectionVideo.style.display = "inline-block";
          divDetectionButton.style.display = "block";
          detectionOK.disabled = false;
          detectionCancel.disabled = false;

          ctrack.stop();
          ctrack.reset();
          lastPosition = undefined;
          ctrack.start(detectionVideo);
          trackingMode = 2;
          drawDetection();
        };
      });
  });

  // <input type="file">をクリックする
  buttonFile.addEventListener("click", e => {
    e.preventDefault();
    // 同じファイルを選択した場合でもchangeを発火させる
    inputFile.value = "";
    inputFile.click();
  });

  // ファイルをcanvasに読みこんで顔認識を開始
  inputFile.addEventListener("change", e => {
    e.preventDefault();

    var file = inputFile.files[0];

    if (!file.type.match(/image.*/)) {
      log(`Not image file (${file.type})`);
      return;
    }

    initialize();
    disableButton();
    changeProgress(1);

    // <img src=~>で読み込むとExifが考慮されないので
    // JavaScript-Load-Imageで読み込み
    loadImage(file, detectFromImage, {orientation: true});
  });

  // サンプルをcanvasに読みこんで顔認識を開始
  var sample = [
    {
      url: "sample/sample1.jpg",
      source: "モナ・リザ",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg",
    }, {
      url: "sample/sample2.jpg",
      source: "フィンセント・ファン・ゴッホの自画像",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:VanGogh_1887_Selbstbildnis.jpg",
    }, {
      url: "sample/sample3.png",
      source: "StyleGAN",
      sourceUrl: "https://github.com/NVlabs/stylegan/blob/b061cc4effdcd1da86a0cc6e61e64b575cf35ffa/stylegan-teaser.png",
    }];
  var previousSample = -1;

  buttonSample.addEventListener("click", e => {
    e.preventDefault();

    initialize();
    disableButton();
    changeProgress(1);
    divSampleSource.style.display = "block";

    var id = (previousSample+1)%3;
    previousSample = id;

    sampleSource.textContent = sample[id].source;
    sampleSource.href = sample[id].sourceUrl;

    image = new Image();
    image.addEventListener("load", () => {
      detectFromImage(image);
    });
    image.src = sample[id].url;
  });

  // 画像から読み込み
  var originalImage;

  function detectFromImage(image) {
    originalImage = image;

    // 幅も高さも320px以下になるように縮小
    var w = image.width;
    var h = image.height;
    if (w>h && w>320) {
      h *= 320/w;
      w = 320;
    } else if (h>320) {
      w *= 320/h;
      h = 320;
    }
    detectionImage.width = w;
    detectionImage.height = h;
    detectionOverlay.width = w;
    detectionOverlay.height = h;

    detectionImage.getContext("2d").drawImage(image, 0, 0, w, h);

    sectionDetection.style.display = "block";
    detectionImage.style.display = "inline-block";

    log("Face detecting");

    ctrack.stop();
    ctrack.reset();
    lastPosition = undefined;
    ctrack.start(detectionImage);
    trackingMode = 1;
    drawDetection();
  }

  // 顔認識の結果を表示
  function drawDetection() {
    var position = ctrack.getCurrentPosition();
    if (position) {
      lastPosition = position;

      var ctx = detectionOverlay.getContext("2d");
      ctx.clearRect(0, 0, detectionOverlay.width, detectionOverlay.height);

      // カメラはCSSで表示を縮小しているので合わせる
      ctx.save();
      if (trackingMode == 2) {
        var r = detectionVideo.videoWidth / detectionVideo.cssWidth;
        ctx.scale(1/r, 1/r);
        ctx.lineWidth = r;
      }
      ctrack.draw(detectionOverlay);
      ctx.restore();
    }
    drawDetectionRequest = requestAnimationFrame(drawDetection);
  }

  function stopDetection() {
    ctrack.stop();
    trackingMode = 0;
    cancelAnimationFrame(drawDetectionRequest);
  }

  document.addEventListener("clmtrackrNotFound", () => {
    if (trackingMode!=1)
      return;
    stopDetection();
    enableButton();
    changeProgress(0);
    log("Failed to detect face (not found)");
  });

  document.addEventListener("clmtrackrLost", () => {
    if (trackingMode!=1)
      return;
    stopDetection();
    log("Failed to detect face (lost)");

    if (lastPosition) {
      log("Use the last detected position");
      makeAverageFace(originalImage, detectionImage.width);
    } else {
      enableButton();
      changeProgress(0);
    }
  });

  // 認識成功
  document.addEventListener("clmtrackrConverged", () => {
    if (trackingMode!=1)
      return;
    stopDetection();
    log("Succeeded to detect face");

    makeAverageFace(originalImage, detectionImage.width);
  });

  // カメラからの撮影でOKをクリック
  detectionOK.addEventListener("click", e => {
    e.preventDefault();

    if (!lastPosition)
      return;

    detectionOK.disabled = true;
    detectionCancel.disabled = true;

    stopDetection();

    // 動画をキャプチャ
    var image = document.createElement("canvas");
    image.width = detectionVideo.width;
    image.height = detectionVideo.height;
    image.getContext("2d").drawImage(
      detectionVideo, 0, 0, image.width, image.height);

    videoStream.getVideoTracks()[0].stop();

    // 画像用のキャンパスに表示
    detectionImage.width = detectionVideo.cssWidth;
    detectionImage.height = detectionVideo.cssHeight;
    detectionImage.getContext("2d").drawImage(
      image, 0, 0, detectionImage.width, detectionImage.height);

    detectionImage.style.display = "inline-block";
    detectionVideo.style.display = "none";

    makeAverageFace(image, detectionVideo.width);
  });

  // カメラからの撮影でキャンセルをクリック
  detectionCancel.addEventListener("click", e => {
    e.preventDefault();

    stopDetection();

    detectionOK.disabled = true;
    detectionCancel.disabled = true;
    enableButton();
    changeProgress(0);

    initialize();
  });

  var canvasFaceOriginal;
  var canvasFaceAveraged;
  var canvasZOriginal;
  var canvasZAveraged;

  function makeAverageFace(image, trackWidth) {
    sectionAveraging.style.display = "block";
    averageSelector.value = 0;
    averageSelector.disabled = true;
    averageOriginal.checked = true;
    averageOriginal.disabled = true;

    // 右目の中心が(61+48, 84+48)、左目の中心が(101+48, 84+48)になるように貼り付け
    var pos = ctrack.getCurrentPosition() || lastPosition;
    var eye_rx = pos[27][0];
    var eye_ry = pos[27][1];
    var eye_lx = pos[32][0];
    var eye_ly = pos[32][1];

    // 縮小前の画像の位置に変換
    var r = image.width / trackWidth;
    eye_rx *= r;
    eye_ry *= r;
    eye_lx *= r;
    eye_ly *= r;
    eye_cx = (eye_rx + eye_lx)/2;
    eye_cy = (eye_ry + eye_ly)/2;

    var angle = Math.atan2(eye_ly-eye_ry, eye_lx-eye_rx);
    var scale = Math.hypot(eye_ly-eye_ry, eye_lx-eye_rx) / (101-61);

    var ctx = averageCanvas.getContext("2d");
    ctx.save();

    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillRect(0, 0, 256, 256);

    ctx.translate((61+101)/2+48, 84+48);
    ctx.rotate(-angle);
    ctx.scale(1/scale, 1/scale);
    ctx.translate(-eye_cx, -eye_cy);
    ctx.drawImage(image, 0, 0);

    ctx.restore();
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.fillRect(0, 256, 256, 16);

    // 顔部分を取得
    canvasFaceOriginal = document.createElement("canvas");
    canvasFaceOriginal.width = 160;
    canvasFaceOriginal.height = 160;
    canvasFaceOriginal.getContext("2d").drawImage(
      averageCanvas, -48, -48);

    canvasZOriginal = document.createElement("canvas");
    canvasZOriginal.width = 256;
    canvasZOriginal.height = 1;
    ctx = canvasZOriginal.getContext("2d");
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.fillRect(0, 0, 256, 1);

    makeAverageFaceAsync();
  }

  // TensorFlowを用いて平均化画像を生成
  var model;

  async function makeAverageFaceAsync() {
    if (!model) {
      var background = useWebGL ? "webgl" : "cpu";
      log(`Use background ${background}`);
      tf.setBackend(background);

      log("Loading model");
      model = await tf.loadGraphModel("model/tensorflowjs_model.pb");
      log("Model loaded");
    }

    var tensor = tf.browser.fromPixels(canvasFaceOriginal, 3)
    tensor = tensor.cast("float32").div(255);
    var input = tf.tile(tensor.expandDims(), [11, 1, 1, 1]);
    var p = new Array(11);
    for (var i=0; i<=10; i++)
      p[i] = i/10;
    p = tf.tensor(p);

    log("Start prediction");
    var tensorZ;
    var tensorAveraged;
    [tensorAveraged, tensorZ] = await model.execute(
      {"Placeholder": input, "Placeholder_16": p},
      ["decoder_16/Sigmoid", "add_18"]);
    log("Prediction finished");

    var z = await tensorZ.data();

    canvasFaceAveraged = new Array(11);
    canvasZAveraged = new Array(11);

    for (var i=0; i<=10; i++) {
      canvasFaceAveraged[i] = document.createElement("canvas");
      await tf.browser.toPixels(
        tensorAveraged.slice(i, 1).reshape([160, 160, 3]),
        canvasFaceAveraged[i]);

      canvasZAveraged[i] = document.createElement("canvas");
      canvasZAveraged[i].width = 256;
      canvasZAveraged[i].height = 1;
      var ctx = canvasZAveraged[i].getContext("2d");
      var data = ctx.getImageData(0, 0, 256, 1);
      for (var j=0; j<256; j++) {
        var v = Math.tanh(z[i*256+j])/2+0.5;
        data.data[j*4+0] = 240*v+20*(1-v);
        data.data[j*4+1] = 230*v+40*(1-v);
        data.data[j*4+2] = 220*v+60*(1-v);
        data.data[j*4+3] = 255;
      }
      ctx.putImageData(data, 0, 0);

      log(`converted to canvas ${i}/10`);

      // Tensorからの変換に時間が掛かるので1枚目を生成した時点で描画
      if (i==0) {
        drawAveragedFace(0);
        averageOriginal.checked = true;
      }
    }

    averageSelector.disabled = false;
    averageOriginal.disabled = false;
    averageOriginal.checked = false;
    enableButton();
    log("OK");
    changeProgress(2);
  }

  averageSelector.addEventListener("input", e => {
    e.preventDefault();

    averageOriginal.checked = false;
    drawAveragedFace(averageSelector.value);
  });

  averageOriginal.addEventListener("change", e => {
    e.preventDefault();

    if (averageOriginal.checked)
      drawAveragedFace(-1);
    else
      drawAveragedFace(averageSelector.value);
  });

  // 顔を描画
  // pが負値ならば元画像
  function drawAveragedFace(p) {
    var face;
    var z;
    if (p<0) {
      face = canvasFaceOriginal;
      z = canvasZOriginal;
    } else {
      face = canvasFaceAveraged[p/10];
      z = canvasZAveraged[p/10];
    }

    var ctx = averageCanvas.getContext("2d");
    ctx.drawImage(face, 48, 48);
    ctx.drawImage(z, 0, 256, 256, 16);
  }
});
