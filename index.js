document.addEventListener("DOMContentLoaded", () => {
  // HTMLエレメント
  var buttonCamera = document.getElementById("buttonCamera");
  var buttonFile = document.getElementById("buttonFile");
  var buttonSample = document.getElementById("buttonSample");
  var inputFile = document.getElementById("inputFile");
  var detectionImage = document.getElementById("detectionImage");
  var detectionVideo = document.getElementById("detectionVideo");
  var detectionOverlay = document.getElementById("detectionOverlay");
  var sampleSource = document.getElementById("sampleSource");
  var detectionOK = document.getElementById("detectionOK");
  var detectionCancel = document.getElementById("detectionCancel");
  var averageCanvas = document.getElementById("averageCanvas");
  var selector = document.getElementById("selector");

  function log(message) {
    var div = document.createElement("div");
    div.textContent = message;
    document.getElementById("log").appendChild(div);
  }

  // フェイストラッキング
  var ctrack = new clm.tracker();
  ctrack.init();
  // 0: トラッキング無し
  // 1: 画像用にトラッキング中
  // 2: 動画用にトラッキング中
  var trackingMode = 0;

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
          detectionVideo.play();
          detectionOverlay.width = detectionVideo.videoWidth;
          detectionOverlay.height = detectionVideo.videoHeight;
          // これを設定しておかないとclmtrackrがエラーになる
          detectionVideo.width = detectionVideo.videoWidth;
          detectionVideo.height = detectionVideo.videoHeight

          detectionImage.style.display = "none";
          detectionVideo.style.display = "inline-block";

          ctrack.stop();
          ctrack.reset();
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

    detectionImage.style.display = "inline-block";
    detectionVideo.style.display = "none";

    ctrack.stop();
    ctrack.reset();
    ctrack.start(detectionImage);
    trackingMode = 1;
    drawDetection();
  }

  // 顔認識の結果を表示
  function drawDetection() {
    detectionOverlay.getContext("2d").clearRect(
      0, 0, detectionOverlay.width, detectionOverlay.height);
    if (ctrack.getCurrentPosition()) {
      ctrack.draw(detectionOverlay);
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
    log("Failed to detect face (not found)");
  });

  document.addEventListener("clmtrackrLost", () => {
    if (trackingMode!=1)
      return;
    stopDetection();
    log("Failed to detect face (lost)");
  });

  // 認識成功
  document.addEventListener("clmtrackrConverged", () => {
    if (trackingMode!=1)
      return;
    stopDetection();
    log("Succeeded to detect face");

    makeAverageFace(originalImage);
  });

  // カメラからの撮影でOKをクリック
  detectionOK.addEventListener("click", e => {
    e.preventDefault();

    if (!ctrack.getCurrentPosition())
      return;
    stopDetection();

    // 動画をキャプチャ
    var image = document.createElement("canvas");
    image.width = detectionVideo.width;
    image.height = detectionVideo.height;
    image.getContext("2d").drawImage(
      detectionVideo, 0, 0, image.width, image.height);

    videoStream.getVideoTracks()[0].stop();

    // 画像用のキャンパスに表示
    detectionImage.width = image.width;
    detectionImage.height = image.height;
    detectionImage.getContext("2d").drawImage(
      detectionVideo, 0, 0, detectionImage.width, detectionImage.height);

    detectionImage.style.display = "inline-block";
    detectionVideo.style.display = "none";

    makeAverageFace(image);
  });

  var canvasFaceOriginal;
  var canvasFaceAveraged;

  function makeAverageFace(image) {
    // 右目の中心が(61+48, 84+48)、左目の中心が(101+48, 84+48)になるように貼り付け
    var pos = ctrack.getCurrentPosition();
    var eye_rx = pos[27][0];
    var eye_ry = pos[27][1];
    var eye_lx = pos[32][0];
    var eye_ly = pos[32][1];

    // 縮小前の画像の位置に変換
    var r = image.width / detectionOverlay.width;
    eye_rx *= r;
    eye_ry *= r;
    eye_lx *= r;
    eye_ly *= r;
    eye_cx = (eye_rx + eye_lx)/2;
    eye_cy = (eye_ry + eye_ly)/2;

    var angle = Math.atan2(eye_ly-eye_ry, eye_lx-eye_rx);
    var scale = Math.hypot(eye_ly-eye_ry, eye_lx-eye_rx) / (101-61);

    var context = averageCanvas.getContext("2d");
    context.save();

    context.fillStyle = "rgb(128, 128, 128)";
    context.fillRect(0, 0, 256, 256);

    context.translate((61+101)/2+48, 84+48);
    context.rotate(-angle);
    context.scale(1/scale, 1/scale);
    context.translate(-eye_cx, -eye_cy);
    context.drawImage(image, 0, 0, image.width, image.height);

    context.restore();

    // 顔部分を取得
    canvasFaceOriginal = document.createElement("canvas");
    canvasFaceOriginal.width = 160;
    canvasFaceOriginal.height = 160;
    canvasFaceOriginal.getContext("2d").drawImage(
      averageCanvas, -48, -48, 256, 256);

    makeAverageFaceAsync();
  }

  // TensorFlowを用いて平均化画像を生成
  var model;

  async function makeAverageFaceAsync() {
    if (!model) {
      log("Loding model");
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

    canvasFaceAveraged = new Array(11);
    for (var i=0; i<=10; i++) {
      canvasFaceAveraged[i] = document.createElement("canvas");
      await tf.browser.toPixels(
        tensorAveraged.slice(i, 1).reshape([160, 160, 3]),
        canvasFaceAveraged[i]);
      log(`converted to canvas ${i}/10`);
      // Tensorからの変換に時間が掛かるので1枚目を生成した時点で描画
      if (i==0)
        averageCanvas.getContext("2d").drawImage(
          canvasFaceAveraged[0], 48, 48, 160, 160);
    }

    selector.value = 1;
  }

  selector.addEventListener("input", () => {
    var c;
    if (selector.value==0)
      c = canvasFaceOriginal;
    else
      c = canvasFaceAveraged[selector.value-1];

    averageCanvas.getContext("2d").drawImage(c, 48, 48, 160, 160);
  });
});
