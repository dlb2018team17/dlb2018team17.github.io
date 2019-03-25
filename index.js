document.addEventListener("DOMContentLoaded", () => {
  var buttonFile = document.getElementById("buttonFile");
  var buttonCamera = document.getElementById("buttonCamera");
  var inputFile = document.getElementById("inputFile");
  var originalImage = document.getElementById("originalImage");
  var originalOverlay = document.getElementById("originalOverlay");
  var canvas = document.getElementById("canvas");
  var canvasOriginal = document.createElement("canvas");
  canvasOriginal.width = 160;
  canvasOriginal.height = 160;

  var original;

  var ctrack = new clm.tracker();
  ctrack.init();
  // 0: トラッキング無し
  // 1: 画像用にトラッキング中
  // 2: 動画用にトラッキング中
  var trackingMode = 0;

  var drawDetectionRequest;
  var stream;

  function log(message) {
    var div = document.createElement("div");
    div.textContent = message;
    document.getElementById("log").appendChild(div);
  }

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

    document.getElementById("log").innerHTML = "";
    document.getElementById("preloader").style.display="block"

    // <img src=~>で読み込むとExifが考慮されないので
    // JavaScript-Load-Imageで読み込み
    loadImage(file, img => {
      original = img;
        // 幅も高さも320px以下になるように縮小
        var w = original.width;
        var h = original.height;
        if (w>h && w>320) {
          h *= 320/w;
          w = 320;
        } else if (h>320) {
          w *= 320/h;
          h = 320;
        }
        var canvasImage = originalImage.getContext("2d");
        var canvasOverlay = originalOverlay.getContext("2d");
        originalImage.width = w;
        originalImage.height = h;
        originalOverlay.width = w;
        originalOverlay.height = h;
        canvasImage.drawImage(original, 0, 0, w, h);

        document.getElementById("originalImage").style.display = "inline-block";
        document.getElementById("video").style.display = "none";

        ctrack.stop();
        ctrack.reset();
        ctrack.start(originalImage);
        trackingMode = 1;
        drawDetection();
    }, {orientation: true});
  });

  buttonCamera.addEventListener("click", e => {
    e.preventDefault();

    if (!navigator.mediaDevices) {
      log("Media devices are not supported");
      return;
    }

    navigator.mediaDevices.getUserMedia({video: {facingMode: "user"}})
      .catch(e => {
        log(`getUserMedia failed (${e.name}: ${e.message})`);
      })
      .then(s => {
        stream = s;
        var video = document.getElementById("video");
        video.srcObject = stream;
        video.onloadedmetadata = e => {
          video.play();
          originalOverlay.width = video.videoWidth;
          originalOverlay.height = video.videoHeight;
          // これを設定しておかないとclmtrackrがエラーになる
          video.width = video.videoWidth;
          video.height = video.videoHeight

          document.getElementById("originalImage").style.display = "none";
          document.getElementById("video").style.display = "inline-block";

          ctrack.stop();
          ctrack.reset();
          ctrack.start(video);
          trackingMode = 2;
          drawDetection();
        };
      });
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
  document.getElementById("buttonSample").addEventListener("click", e => {
    e.preventDefault();

    document.getElementById("log").innerHTML = "";
    document.getElementById("preloader").style.display="block"

    original = new Image();
    original.addEventListener("load", () => {
      // 幅も高さも320px以下になるように縮小
      var w = original.width;
      var h = original.height;
      if (w>h && w>320) {
        h *= 320/w;
        w = 320;
      } else if (h>320) {
        w *= 320/h;
        h = 320;
      }
      var canvasImage = originalImage.getContext("2d");
      var canvasOverlay = originalOverlay.getContext("2d");
      originalImage.width = w;
      originalImage.height = h;
      originalOverlay.width = w;
      originalOverlay.height = h;
      canvasImage.drawImage(original, 0, 0, w, h);

      document.getElementById("originalImage").style.display = "inline-block";
      document.getElementById("video").style.display = "none";

      ctrack.stop();
      ctrack.reset();
      ctrack.start(originalImage);
      trackingMode = 1;
      drawDetection();
    });
    var id = (previousSample+1)%3;
    previousSample = id;
    original.src = sample[id].url;
    var source = document.getElementById("sampleSource");
    source.textContent = sample[id].source;
    source.href = sample[id].sourceUrl;
  });

  // 顔認識の結果を表示
  function drawDetection() {
    var c = originalOverlay.getContext("2d");
    c.clearRect(0, 0, originalOverlay.width, originalOverlay.height);
    if (ctrack.getCurrentPosition()) {
      ctrack.draw(originalOverlay);
    }
    drawDetectionRequest = requestAnimationFrame(drawDetection);
  }

  document.addEventListener("clmtrackrNotFound", () => {
    if (trackingMode!=1)
      return;
    ctrack.stop();
    trackingMode = 0;
    cancelAnimationFrame(drawDetectionRequest);
    log("Failed to detect face (not found)");
  });

  document.addEventListener("clmtrackrLost", () => {
    if (trackingMode!=1)
      return;
    ctrack.stop();
    trackingMode = 0;
    cancelAnimationFrame(drawDetectionRequest);
    log("Failed to detect face (lost)");
  });

  var model;
  var canvasAveraged;

  // 認識成功
  document.addEventListener("clmtrackrConverged", () => {
    if (trackingMode!=1)
      return;
    ctrack.stop();
    trackingMode = 0;
    cancelAnimationFrame(drawDetectionRequest);
    log("Succeeded to detect face");

    // 右目の中心が(61+80, 84+80)、左目の中心が(101+80, 84+80)になるように貼り付け
    var c = canvas.getContext("2d");
    c.save();

    c.fillStyle = "rgb(128, 128, 128)";
    c.fillRect(0, 0, 320, 320);

    var pos = ctrack.getCurrentPosition();
    var eye_rx = pos[27][0];
    var eye_ry = pos[27][1];
    var eye_lx = pos[32][0];
    var eye_ly = pos[32][1];

    // 縮小前の画像の位置に変換
    var r = original.width / originalImage.width;
    eye_rx *= r;
    eye_ry *= r;
    eye_lx *= r;
    eye_ly *= r;
    eye_cx = (eye_rx + eye_lx)/2;
    eye_cy = (eye_ry + eye_ly)/2;

    var angle = Math.atan2(eye_ly-eye_ry, eye_lx-eye_rx);
    var scale = Math.hypot(eye_ly-eye_ry, eye_lx-eye_rx) / (101-61);

    c.translate((61+101)/2+80, 84+80);
    c.rotate(-angle);
    c.scale(1/scale, 1/scale);
    c.translate(-eye_cx, -eye_cy);
    c.drawImage(original, 0, 0, original.width, original.height);

    c.restore();

    // 顔部分を別のキャンバスに貼り付ける
    var contextTemp = canvasOriginal.getContext("2d");
    contextTemp.drawImage(canvas, -80, -80, 320, 320);

    makeAverageFace();
  });

  document.getElementById("buttonCameraOK").addEventListener("click", e => {
    e.preventDefault();

    var pos = ctrack.getCurrentPosition();
    if (!pos)
      return;
    ctrack.stop();
    trackingMode = 0;
    cancelAnimationFrame(drawDetectionRequest);

    // 動画をキャプチャして画像用のキャンバスに貼り付ける
    var video = document.getElementById("video");
    originalImage.width = video.width;
    originalImage.height = video.height;
    var c = originalImage.getContext("2d");
    c.drawImage(video, 0, 0, video.width, video.height);
    stream.getVideoTracks()[0].stop();
    originalImage.style.display = "inline-block";
    video.style.display = "none";

    // 右目の中心が(61+80, 84+80)、左目の中心が(101+80, 84+80)になるように貼り付け
    c = canvas.getContext("2d");
    c.save();

    c.fillStyle = "rgb(128, 128, 128)";
    c.fillRect(0, 0, 320, 320);

    var eye_rx = pos[27][0];
    var eye_ry = pos[27][1];
    var eye_lx = pos[32][0];
    var eye_ly = pos[32][1];

    eye_cx = (eye_rx + eye_lx)/2;
    eye_cy = (eye_ry + eye_ly)/2;

    var angle = Math.atan2(eye_ly-eye_ry, eye_lx-eye_rx);
    var scale = Math.hypot(eye_ly-eye_ry, eye_lx-eye_rx) / (101-61);

    c.translate((61+101)/2+80, 84+80);
    c.rotate(-angle);
    c.scale(1/scale, 1/scale);
    c.translate(-eye_cx, -eye_cy);
    c.drawImage(originalImage, 0, 0, originalImage.width, originalImage.height);

    c.restore();

    // 顔部分を別のキャンバスに貼り付ける
    var contextTemp = canvasOriginal.getContext("2d");
    contextTemp.drawImage(canvas, -80, -80, 320, 320);

    makeAverageFace();
  });

  var selector = document.getElementById("selector");

  // tensorOriginalから平均に近づけたtensorAveragedを作成
  async function makeAverageFace() {
    if (!model) {
      log("Loding model");
      model = await tf.loadGraphModel("model/tensorflowjs_model.pb");
      log("Model loaded");
    }

    var tensor = tf.browser.fromPixels(canvasOriginal, 3).cast("float32").div(255);
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

    canvasAveraged = new Array(11);
    for (var i=0; i<=10; i++) {
      canvasAveraged[i] = document.createElement("canvas");
      await tf.browser.toPixels(tensorAveraged.slice(i, 1).reshape([160, 160, 3]), canvasAveraged[i]);
      log(`converted to canvas ${i}/10`);
      if (i==0)
        canvas.getContext("2d").drawImage(canvasAveraged[0], 80, 80, 160, 160);
    }
    selector.value = 1;

    document.getElementById("preloader").style.display="none";
  }

  selector.addEventListener("input", () => {
    var c;
    if (selector.value==0)
      c = canvasOriginal;
    else
      c = canvasAveraged[selector.value-1];

    canvas.getContext("2d").drawImage(c, 80, 80, 160, 160);
  });
});
