import React, { useRef, useState, useEffect } from 'react';
import { Camera, FileImage, Upload, CornerDownRight, RotateCcw, Sparkles, Filter, Check, RefreshCw, Plus, Trash2, ArrowUp, ArrowDown, AlertTriangle, Info, FileCheck } from 'lucide-react';
import { Point, warpPerspective, applyDocumentFilter } from '../utils';

interface PodScannerProps {
  loadNumber: string;
  onSavePod: (podDataUrl: string, fileName: string) => void;
  onClose: () => void;
}

interface ScannedPage {
  id: string;
  sourceImage: string; // original snapshot or loaded file
  corners: [Point, Point, Point, Point];
  croppedImage: string | null; // straightened & enhanced preview
  filter: 'original' | 'greyscale' | 'high_contrast' | 'scan_boost';
  qualityScore: number; // 0 - 100
  qualityStatus: 'excellent' | 'good' | 'blurry' | 'dirty';
  qualityReason?: string;
}

// Low-level mathematical image quality assessment (sharpness and contrast)
function assessImageQuality(canvas: HTMLCanvasElement): {
  score: number;
  status: 'excellent' | 'good' | 'blurry' | 'dirty';
  reason?: string;
} {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { score: 100, status: 'excellent' };
  
  const width = canvas.width;
  const height = canvas.height;
  
  // Downsample to a smaller size for performance
  const calcCanvas = document.createElement('canvas');
  calcCanvas.width = 150;
  calcCanvas.height = 180;
  const calcCtx = calcCanvas.getContext('2d');
  if (!calcCtx) return { score: 100, status: 'excellent' };
  
  calcCtx.drawImage(canvas, 0, 0, 150, 180);
  const imgData = calcCtx.getImageData(0, 0, 150, 180);
  const data = imgData.data;
  
  let sumBrightness = 0;
  let maxB = 0;
  let minB = 255;
  
  // Calculate average brightness and min/max
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
    sumBrightness += brightness;
    if (brightness > maxB) maxB = brightness;
    if (brightness < minB) minB = brightness;
  }
  const avgBrightness = sumBrightness / (150 * 180);
  const contrast = maxB - minB;
  
  // Spatial gradient difference sharpness checker (Laplacian approximation)
  let sharpnessSum = 0;
  let count = 0;
  
  for (let y = 1; y < 179; y += 2) {
    for (let x = 1; x < 149; x += 2) {
      const idx = (y * 150 + x) * 4;
      
      const v = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      
      const vLeft = 0.299 * data[idx - 4] + 0.587 * data[idx - 3] + 0.114 * data[idx - 2];
      const vRight = 0.299 * data[idx + 4] + 0.587 * data[idx + 5] + 0.114 * data[idx + 6];
      const vUp = 0.299 * data[idx - 150 * 4] + 0.587 * data[idx - 150 * 4 + 1] + 0.114 * data[idx - 150 * 4 + 2];
      const vDown = 0.299 * data[idx + 150 * 4] + 0.587 * data[idx + 150 * 4 + 1] + 0.114 * data[idx + 150 * 4 + 2];
      
      const dx = Math.abs(vLeft - vRight);
      const dy = Math.abs(vUp - vDown);
      sharpnessSum += dx + dy;
      count++;
    }
  }
  
  const averageGradient = sharpnessSum / count;
  
  let status: 'excellent' | 'good' | 'blurry' | 'dirty' = 'excellent';
  let reason = '';
  
  if (averageGradient < 2.0) {
    status = 'blurry';
    reason = 'The picture is too fuzzy or out of focus. Please hold your camera steady and retake it.';
  } else if (avgBrightness < 30) {
    status = 'dirty';
    reason = 'The picture is too dark. Please capture the document in a well-lit area.';
  } else if (avgBrightness > 240) {
    status = 'dirty';
    reason = 'The picture is overexposed or washed out. Please adjust your lighting.';
  } else if (contrast < 60) {
    status = 'dirty';
    reason = 'Low contrast detected. Please make sure text, stamps, and signatures are clearly legible.';
  } else if (averageGradient < 3.8) {
    status = 'good';
  }
  
  let score = Math.round(Math.min(100, Math.max(10, (averageGradient * 8.5 + contrast * 0.3))));
  
  return {
    score,
    status,
    reason
  };
}

// Generate demo content with specific details depending on page sequence
const generateDemoDocument = (pageIndex: number, loadNum: string): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // Paper base
  ctx.fillStyle = '#fafaf9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Simulated paper fiber/scanner noise
  ctx.fillStyle = 'rgba(0, 0, 0, 0.02)';
  for (let i = 0; i < 30; i++) {
    ctx.fillRect(Math.random() * 400, Math.random() * 480, Math.random() * 3 + 1, Math.random() * 3 + 1);
  }

  // Margins
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(15, 15, 370, 450);

  ctx.fillStyle = '#1e293b';
  
  if (pageIndex === 0) {
    // Page 1: BOL
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('BILL OF LADING (BOL) - PAGE 1', 25, 45);
    
    ctx.fillStyle = '#475569';
    ctx.font = '9px monospace';
    ctx.fillText(`SHIPMENT NO: ${loadNum}`, 25, 65);
    ctx.fillText(`DATE: July 21, 2026`, 25, 77);
    ctx.fillText(`CARRIER: TruckDispatch Pro Global`, 25, 89);
    
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(25, 100, 350, 2);
    
    ctx.font = 'bold 9px monospace';
    ctx.fillText('ITEM / DESCRIPTION', 25, 125);
    ctx.fillText('QTY', 250, 125);
    ctx.fillText('WEIGHT', 310, 125);
    
    ctx.font = '9px monospace';
    ctx.fillText('Industrial Turbine Rotor Core v2', 25, 145);
    ctx.fillText('1 pc', 250, 145);
    ctx.fillText('34,200 lb', 310, 145);
    
    ctx.fillText('Steel Anchors & Framing Harness', 25, 165);
    ctx.fillText('4 cs', 250, 165);
    ctx.fillText('1,400 lb', 310, 165);
    
    // Signatures
    ctx.fillRect(25, 380, 140, 1);
    ctx.fillRect(235, 380, 140, 1);
    
    ctx.font = 'bold 8px monospace';
    ctx.fillText('Shipper Signature', 25, 392);
    ctx.fillText('Carrier/Driver (NELSON)', 235, 392);
    
    // Blue signature scribble
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(245, 375);
    ctx.quadraticCurveTo(265, 360, 285, 375);
    ctx.quadraticCurveTo(305, 385, 325, 365);
    ctx.stroke();

    // Red Stamp
    ctx.strokeStyle = 'rgba(220, 38, 38, 0.65)';
    ctx.lineWidth = 3;
    ctx.strokeRect(210, 230, 160, 45);
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = 'rgba(220, 38, 38, 0.75)';
    ctx.save();
    ctx.translate(290, 255);
    ctx.rotate(-0.06);
    ctx.fillText('POD APPROVED', -45, 4);
    ctx.restore();
    
  } else if (pageIndex === 1) {
    // Page 2: Packing List
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('PACKING SLIP & MANIFEST - PAGE 2', 25, 45);
    
    ctx.fillStyle = '#475569';
    ctx.font = '9px monospace';
    ctx.fillText(`BOL LINKED: BOL-${loadNum}`, 25, 65);
    ctx.fillText(`TOTAL PALLETS: 4 PIECES`, 25, 77);
    
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(25, 100, 350, 2);
    
    ctx.font = 'bold 9px monospace';
    ctx.fillText('CRATE SERIAL NO', 25, 125);
    ctx.fillText('DIMENSIONS (IN)', 180, 125);
    ctx.fillText('CONTENTS', 280, 125);
    
    ctx.font = '9px monospace';
    ctx.fillText('CRT-8021-A1', 25, 145);
    ctx.fillText('48 x 48 x 72', 180, 145);
    ctx.fillText('Rotor Core', 280, 145);
    
    ctx.fillText('CRT-8021-B2', 25, 165);
    ctx.fillText('48 x 48 x 72', 180, 165);
    ctx.fillText('Anchor Frame', 280, 165);
    
    ctx.fillText('PLT-8021-C3', 25, 185);
    ctx.fillText('40 x 48 x 45', 180, 185);
    ctx.fillText('Rigging Gear', 280, 185);

    // Green Stamp
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.65)';
    ctx.lineWidth = 3;
    ctx.strokeRect(50, 300, 160, 45);
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = 'rgba(16, 185, 129, 0.75)';
    ctx.save();
    ctx.translate(130, 325);
    ctx.rotate(0.04);
    ctx.fillText('INVENTORY VALID', -50, 4);
    ctx.restore();
    
  } else {
    // Page 3: Weight Scale
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('CAT SCALE WEIGHT TICKET - PAGE 3', 25, 45);
    
    ctx.fillStyle = '#475569';
    ctx.font = '9px monospace';
    ctx.fillText(`TICKET: scale-491028`, 25, 65);
    ctx.fillText(`STATION: CAT Scale #102, TX`, 25, 77);
    
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(25, 100, 350, 2);
    
    ctx.font = 'bold 10px monospace';
    ctx.fillText('AXLE DETAIL', 25, 125);
    ctx.fillText('WEIGHT (LBS)', 250, 125);
    
    ctx.font = '10px monospace';
    ctx.fillText('STEER AXLE:', 25, 150);
    ctx.fillText('11,800 lb', 250, 150);
    
    ctx.fillText('DRIVE AXLE:', 25, 170);
    ctx.fillText('33,400 lb', 250, 170);
    
    ctx.fillText('TRAILER AXLE:', 25, 190);
    ctx.fillText('32,960 lb', 250, 190);
    
    ctx.fillRect(25, 210, 350, 1);
    
    ctx.font = 'bold 11px monospace';
    ctx.fillText('GROSS TOTAL WEIGHT:', 25, 230);
    ctx.fillText('78,160 lb', 250, 230);
    
    // Scale Stamp
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.65)';
    ctx.lineWidth = 3;
    ctx.strokeRect(200, 300, 160, 45);
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = 'rgba(59, 130, 246, 0.75)';
    ctx.save();
    ctx.translate(280, 325);
    ctx.rotate(-0.03);
    ctx.fillText('CERTIFIED SCALE', -50, 4);
    ctx.restore();
  }

  return canvas.toDataURL('image/jpeg');
};

export default function PodScanner({ loadNumber, onSavePod, onClose }: PodScannerProps) {
  // Store an array of multiple scanned pages
  const [pages, setPages] = useState<ScannedPage[]>([
    {
      id: 'page_1',
      sourceImage: '',
      corners: [
        { x: 50, y: 50 },
        { x: 350, y: 60 },
        { x: 370, y: 440 },
        { x: 30, y: 430 }
      ],
      croppedImage: null,
      filter: 'scan_boost',
      qualityScore: 100,
      qualityStatus: 'excellent'
    }
  ]);
  
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isCompiling, setIsCompiling] = useState(false);
  
  // WebRTC Live Webcam Stream integration
  const videoRef = useRef<HTMLVideoElement>(null);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [isStartingWebcam, setIsStartingWebcam] = useState(false);

  const [activeCornerIdx, setActiveCornerIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const activePage = pages[activePageIndex] || null;

  // Handle live video stream lifecycle
  const startWebcam = async () => {
    setIsStartingWebcam(true);
    setWebcamError(null);
    try {
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setWebcamError("Camera API is not supported in this browser context (requires HTTPS or secure origin). You can still select files or capture receipts using the options below.");
        setIsStartingWebcam(false);
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch (firstErr) {
        console.warn("Primary camera constraints failed, trying generic video constraints:", firstErr);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }
      
      setWebcamStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.warn("Webcam activation failed:", err);
      setWebcamError("Camera stream blocked or unavailable. You can still snap photos using your device camera or select files from your gallery!");
    } finally {
      setIsStartingWebcam(false);
    }
  };

  const stopWebcam = () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      setWebcamStream(null);
    }
  };

  useEffect(() => {
    if (isCameraActive && activePage && !activePage.sourceImage) {
      startWebcam();
    } else {
      stopWebcam();
    }
    return () => {
      stopWebcam();
    };
  }, [isCameraActive, activePageIndex, activePage?.sourceImage]);

  // Handle taking snapshot from the live video element
  const handleSnapPhoto = () => {
    if (!videoRef.current || !activePage) return;
    const video = videoRef.current;

    try {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = video.videoWidth || 640;
      tempCanvas.height = video.videoHeight || 480;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        const dataUrl = tempCanvas.toDataURL('image/jpeg');
        handleLoadSourceImage(dataUrl);
      }
    } catch (e) {
      console.error("Failed to capture snapshot from webcam feed:", e);
    }
  };

  // Process loaded/captured source image
  const handleLoadSourceImage = (dataUrl: string) => {
    if (activePageIndex === -1 || !activePage) return;

    // Create image to analyze and update state
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = dataUrl;
    img.onload = () => {
      // Analyze quality instantly on the original input
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 400;
      tempCanvas.height = 480;
      const tempCtx = tempCanvas.getContext('2d');
      let qResult: { score: number; status: 'excellent' | 'good' | 'blurry' | 'dirty'; reason?: string } = {
        score: 90,
        status: 'excellent',
        reason: undefined
      };
      if (tempCtx) {
        tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
        qResult = assessImageQuality(tempCanvas);
      }

      setPages(prev => prev.map((p, idx) => idx === activePageIndex ? {
        ...p,
        sourceImage: dataUrl,
        croppedImage: null, // Force user to confirm crop/alignment
        qualityScore: qResult.score,
        qualityStatus: qResult.status,
        qualityReason: qResult.reason
      } : p));

      setIsCameraActive(false);
      stopWebcam();
    };
  };

  // Add sample/mock document
  const handleLoadDemoDocument = () => {
    const demoData = generateDemoDocument(activePageIndex, loadNumber);
    handleLoadSourceImage(demoData);
  };

  // File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        handleLoadSourceImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Draw current active page onto crop canvas
  useEffect(() => {
    if (!activePage || !activePage.sourceImage || !canvasRef.current || isCameraActive) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = activePage.sourceImage;
    img.onload = () => {
      canvas.width = 400;
      canvas.height = 480;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
  }, [activePage?.sourceImage, activePageIndex, isCameraActive, activePage?.croppedImage]);

  // Handle dragging corners
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, idx: number) => {
    e.preventDefault();
    setActiveCornerIdx(idx);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeCornerIdx === null || !canvasRef.current || !activePage) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvasRef.current.width, ((e.clientX - rect.left) / rect.width) * canvasRef.current.width));
    const y = Math.max(0, Math.min(canvasRef.current.height, ((e.clientY - rect.top) / rect.height) * canvasRef.current.height));

    const newCorners = [...activePage.corners] as [Point, Point, Point, Point];
    newCorners[activeCornerIdx] = { x, y };
    
    setPages(prev => prev.map((p, idx) => idx === activePageIndex ? { ...p, corners: newCorners } : p));
  };

  const handlePointerUp = () => {
    setActiveCornerIdx(null);
  };

  // Perform homography and apply filters
  const handleStraightenAndCrop = (filterToApply = activePage?.filter || 'scan_boost') => {
    if (!activePage || !canvasRef.current) return;

    // Load the original image to preserve full source resolution (prevent downscaling during warp)
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = activePage.sourceImage;
    img.onload = () => {
      // Get actual dimensions of the original source image
      const originalWidth = img.naturalWidth || img.width || 400;
      const originalHeight = img.naturalHeight || img.height || 480;

      // Create high-resolution offscreen canvas
      const highResCanvas = document.createElement('canvas');
      highResCanvas.width = originalWidth;
      highResCanvas.height = originalHeight;
      const highResCtx = highResCanvas.getContext('2d');
      if (!highResCtx) return;
      highResCtx.drawImage(img, 0, 0, originalWidth, originalHeight);

      // Scale corners from the 400x480 interactive canvas coordinates to high-res coordinates
      const scaleX = originalWidth / 400;
      const scaleY = originalHeight / 480;

      const scaledCorners: [Point, Point, Point, Point] = [
        { x: activePage.corners[0].x * scaleX, y: activePage.corners[0].y * scaleY },
        { x: activePage.corners[1].x * scaleX, y: activePage.corners[1].y * scaleY },
        { x: activePage.corners[2].x * scaleX, y: activePage.corners[2].y * scaleY },
        { x: activePage.corners[3].x * scaleX, y: activePage.corners[3].y * scaleY }
      ];

      // Use higher destination width and height for crystal-clear sharp documents
      const destWidth = 1000;
      const destHeight = 1350;

      // Execute perspective warp on full resolution
      const croppedData = warpPerspective(
        highResCtx,
        originalWidth,
        originalHeight,
        scaledCorners,
        destWidth,
        destHeight
      );

      // Apply specific enhancement filter on high-res cropped data
      applyDocumentFilter(croppedData.data, filterToApply, destWidth, destHeight);

      // Render result to high-res dataURL
      const resultCanvas = document.createElement('canvas');
      resultCanvas.width = destWidth;
      resultCanvas.height = destHeight;
      const resultCtx = resultCanvas.getContext('2d');
      if (resultCtx) {
        resultCtx.putImageData(croppedData, 0, 0);
        const dataUrl = resultCanvas.toDataURL('image/jpeg', 0.95);
        
        // Measure final cropped/enhanced quality using original-scale quality assessment
        const finalQuality = assessImageQuality(resultCanvas);

        setPages(prev => prev.map((p, idx) => idx === activePageIndex ? {
          ...p,
          croppedImage: dataUrl,
          filter: filterToApply,
          qualityScore: finalQuality.score,
          qualityStatus: finalQuality.status,
          qualityReason: finalQuality.reason
        } : p));
      }
    };
  };

  // Manage Multi-Page Operations
  const handleAddPage = () => {
    // Save current active page if needed
    if (activePage && !activePage.croppedImage && activePage.sourceImage) {
      handleStraightenAndCrop();
    }

    const nextIdx = pages.length;
    const newPage: ScannedPage = {
      id: `page_${Date.now()}`,
      sourceImage: '',
      corners: [
        { x: 40, y: 40 },
        { x: 360, y: 40 },
        { x: 360, y: 440 },
        { x: 40, y: 440 }
      ],
      croppedImage: null,
      filter: 'scan_boost',
      qualityScore: 100,
      qualityStatus: 'excellent'
    };

    setPages(prev => [...prev, newPage]);
    setActivePageIndex(nextIdx);
    setIsCameraActive(true);
  };

  const handleDeletePage = (indexToDelete: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (pages.length <= 1) {
      // Keep at least one page reset
      setPages([
        {
          id: `page_${Date.now()}`,
          sourceImage: '',
          corners: [
            { x: 50, y: 50 },
            { x: 350, y: 60 },
            { x: 370, y: 440 },
            { x: 30, y: 430 }
          ],
          croppedImage: null,
          filter: 'scan_boost',
          qualityScore: 100,
          qualityStatus: 'excellent'
        }
      ]);
      setActivePageIndex(0);
      setIsCameraActive(true);
      return;
    }

    const updated = pages.filter((_, idx) => idx !== indexToDelete);
    setPages(updated);
    
    // Adjust active index
    if (activePageIndex >= updated.length) {
      setActivePageIndex(updated.length - 1);
    } else if (activePageIndex === indexToDelete) {
      setActivePageIndex(Math.max(0, indexToDelete - 1));
    }
  };

  const handleMovePage = (index: number, direction: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === pages.length - 1) return;

    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const updated = [...pages];
    
    // Swap
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;

    setPages(updated);
    if (activePageIndex === index) {
      setActivePageIndex(targetIdx);
    } else if (activePageIndex === targetIdx) {
      setActivePageIndex(index);
    }
  };

  // Compile all pages vertically into one unified file for storage
  const handleCompileAndSaveAll = async () => {
    // 1. Double check that we have cropped images for all pages that have source images
    const pagesToCompile = pages.filter(p => p.sourceImage !== '');
    if (pagesToCompile.length === 0) {
      alert("Please capture or upload at least 1 page before saving.");
      return;
    }

    // Ensure all have cropped files
    const uncroppedIdx = pagesToCompile.findIndex(p => p.croppedImage === null);
    if (uncroppedIdx !== -1) {
      alert(`Page ${uncroppedIdx + 1} has not been cropped/confirmed. Please click 'Straighten & Save Page' on it first.`);
      setActivePageIndex(pages.indexOf(pagesToCompile[uncroppedIdx]));
      return;
    }

    // Warn if there are blurry or low quality pages
    const warningPages = pagesToCompile.filter(p => p.qualityStatus === 'blurry' || p.qualityStatus === 'dirty');
    if (warningPages.length > 0) {
      const confirmOverride = window.confirm(
        `⚠️ Warning: ${warningPages.length} scanned pages have poor quality (blurry or low-contrast). This may lead to billing rejection. Do you want to upload anyway?`
      );
      if (!confirmOverride) return;
    }

    setIsCompiling(true);
    try {
      const destWidth = 1000;
      const destHeight = 1350;
      
      const compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = destWidth;
      compositeCanvas.height = destHeight * pagesToCompile.length;
      const compCtx = compositeCanvas.getContext('2d');
      if (!compCtx) throw new Error("Could not construct unified rendering context.");

      // Draw each cropped page stacked vertically
      for (let i = 0; i < pagesToCompile.length; i++) {
        const page = pagesToCompile[i];
        const yOffset = i * destHeight;

        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.crossOrigin = 'anonymous';
          el.src = page.croppedImage!;
          el.onload = () => resolve(el);
          el.onerror = (err) => reject(err);
        });

        compCtx.drawImage(img, 0, yOffset, destWidth, destHeight);

        // Render black horizontal page break boundary
        if (i < pagesToCompile.length - 1) {
          compCtx.strokeStyle = '#020617';
          compCtx.lineWidth = 12; // slightly thicker for high-res page split
          compCtx.beginPath();
          compCtx.moveTo(0, yOffset + destHeight);
          compCtx.lineTo(destWidth, yOffset + destHeight);
          compCtx.stroke();
        }
      }

      const finalDataUrl = compositeCanvas.toDataURL('image/jpeg', 0.95);
      onSavePod(finalDataUrl, `POD_${loadNumber}_${pagesToCompile.length}p.jpg`);
    } catch (e) {
      console.error("Composite build failed:", e);
      alert("Failed to compile multi-page document. Please try again.");
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 backdrop-blur-md overflow-y-auto" id="pod-scanner-modal">
      <div className="w-full max-w-5xl rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl text-white flex flex-col max-h-[96vh] sm:max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-2 text-yellow-500">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-heading text-sm sm:text-base font-extrabold tracking-tight">Proof of Delivery (POD) Scanner</h3>
              <p className="text-[11px] text-zinc-400">
                Load: <span className="font-mono text-yellow-500 font-bold">{loadNumber}</span> 
                <span className="mx-2 text-zinc-600">•</span> 
                Pages Scanned: <span className="text-zinc-200 font-bold">{pages.filter(p => p.croppedImage).length} of {pages.length}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition text-xs font-mono"
          >
            ✕ Close
          </button>
        </div>

        {/* Modal Body Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-0">
          
          {/* LEFT COLUMN: PAGE THUMBNAILS LIST (3 Columns) */}
          <div className="lg:col-span-3 border-r border-zinc-800 bg-zinc-950/60 p-3 flex flex-col justify-between overflow-y-auto min-h-[140px] lg:min-h-0 shrink-0">
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-bold">
                <span>Scanned Pages ({pages.length})</span>
                <span>Page Order</span>
              </div>
              
              {/* Scrollable list of page cards */}
              <div className="space-y-2 max-h-[180px] lg:max-h-[50vh] overflow-y-auto pr-1">
                {pages.map((p, idx) => {
                  const isActive = idx === activePageIndex;
                  const isScanned = !!p.sourceImage;
                  const isCropped = !!p.croppedImage;
                  
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setActivePageIndex(idx);
                        setIsCameraActive(!isScanned);
                      }}
                      className={`group p-2.5 rounded-xl border text-left cursor-pointer transition flex gap-2 items-center ${
                        isActive
                          ? 'bg-yellow-500/10 border-yellow-500 text-yellow-200 shadow-md'
                          : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      {/* Left thumbnail or preview box */}
                      <div className="h-11 w-9 rounded bg-zinc-950 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center relative">
                        {isCropped ? (
                          <img src={p.croppedImage!} alt="" className="h-full w-full object-cover" />
                        ) : isScanned ? (
                          <div className="text-[8px] text-zinc-500 font-mono text-center leading-none">CROP NEEDED</div>
                        ) : (
                          <Camera className="h-4 w-4 text-zinc-600" />
                        )}
                        <span className="absolute bottom-0 right-0 bg-zinc-950/90 text-white text-[8px] font-mono font-bold px-1 rounded-tl border-t border-l border-zinc-800">
                          P{idx+1}
                        </span>
                      </div>

                      {/* Middle page metadata */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold truncate">Page {idx + 1}</span>
                          
                          {/* Quality Badge */}
                          {isScanned && (
                            <span className={`h-2 w-2 rounded-full ${
                              p.qualityStatus === 'excellent' ? 'bg-emerald-500' :
                              p.qualityStatus === 'good' ? 'bg-emerald-400' :
                              p.qualityStatus === 'blurry' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'
                            }`} title={`Quality: ${p.qualityStatus.toUpperCase()} (${p.qualityScore}/100)`}></span>
                          )}
                        </div>
                        
                        <p className="text-[9px] font-mono text-zinc-500 mt-0.5 truncate">
                          {isCropped ? `Filter: ${p.filter}` : isScanned ? 'Straighten pending' : 'Awaiting capture'}
                        </p>
                      </div>

                      {/* Right controls */}
                      <div className="flex flex-col gap-1 opacity-60 group-hover:opacity-100 transition shrink-0">
                        <div className="flex gap-1">
                          <button
                            title="Move Page Up"
                            disabled={idx === 0}
                            onClick={(e) => handleMovePage(idx, 'up', e)}
                            className="p-1 rounded bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-20 transition"
                          >
                            <ArrowUp className="h-2.5 w-2.5" />
                          </button>
                          <button
                            title="Move Page Down"
                            disabled={idx === pages.length - 1}
                            onClick={(e) => handleMovePage(idx, 'down', e)}
                            className="p-1 rounded bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-20 transition"
                          >
                            <ArrowDown className="h-2.5 w-2.5" />
                          </button>
                        </div>
                        <button
                          title="Delete Page"
                          onClick={(e) => handleDeletePage(idx, e)}
                          className="p-1 rounded bg-red-950/60 hover:bg-red-900 border border-red-900/40 text-red-400 hover:text-white transition flex items-center justify-center"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Add page button */}
            <button
              onClick={handleAddPage}
              className="mt-4 w-full py-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition active:scale-98"
            >
              <Plus className="h-4 w-4 text-yellow-500" /> Add Another Page
            </button>
          </div>

          {/* MIDDLE COLUMN: WORKSPACE VIEWPORT (5 Columns) */}
          <div className="lg:col-span-5 bg-zinc-950 p-4 flex flex-col items-center justify-center min-h-[380px] lg:min-h-0 overflow-y-auto">
            
            {activePage ? (
              isCameraActive || !activePage.sourceImage ? (
                /* 1. VIEW FINDER / SOURCE PHOTO PICKER */
                <div className="w-full max-w-[340px] aspect-[4/5] bg-black rounded-xl border border-zinc-800 flex flex-col justify-between p-4 relative overflow-hidden shadow-2xl">
                  
                  {webcamStream ? (
                    <div className="absolute inset-0 w-full h-full z-0 bg-slate-950">
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className="w-full h-full object-cover"
                        id="webcam-live-video"
                      />
                      
                      {/* Scan grid guides */}
                      <div className="absolute inset-6 border border-dashed border-yellow-500/30 rounded flex items-center justify-center pointer-events-none">
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-yellow-500"></div>
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-yellow-500"></div>
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-yellow-500"></div>
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-yellow-500"></div>
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-yellow-500 to-transparent shadow-[0_0_12px_rgba(234,179,8,0.8)] animate-[bounce_3.5s_infinite]"></div>
                      </div>

                      {/* Header overlay */}
                      <div className="absolute top-2.5 left-2.5 right-2.5 flex justify-between items-center text-[9px] font-mono text-white bg-zinc-900/95 backdrop-blur-md px-2 py-1 rounded border border-zinc-800">
                        <span className="flex items-center gap-1.5 font-bold">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping"></span> 
                          LIVE CAMERA (P.{activePageIndex + 1})
                        </span>
                        <span>AUTO-GAIN</span>
                      </div>

                      {/* Action trigger overlay */}
                      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-col gap-2 z-10">
                        <button
                          onClick={handleSnapPhoto}
                          className="w-full bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-extrabold text-xs py-2.5 px-4 rounded-lg flex items-center justify-center gap-1.5 shadow-lg transition active:scale-98"
                        >
                          <Camera className="h-4 w-4" /> Snap Page {activePageIndex + 1}
                        </button>
                        
                        <div className="flex gap-1.5">
                          <label className="flex-1 bg-zinc-900/95 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-bold text-[9px] py-1.5 px-1 rounded flex items-center justify-center gap-1 cursor-pointer transition">
                            <Upload className="h-3 w-3" /> Camera App
                            <input type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" />
                          </label>
                          <label className="flex-1 bg-zinc-900/95 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-bold text-[9px] py-1.5 px-1 rounded flex items-center justify-center gap-1 cursor-pointer transition">
                            <Upload className="h-3 w-3" /> Photo Gallery
                            <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                          </label>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* HYBRID FALLBACK FRAME */
                    <>
                      <div className="absolute inset-4 border border-dashed border-zinc-800 rounded flex items-center justify-center pointer-events-none">
                        <div className="absolute top-0 left-0 w-6 h-6 border-t border-l border-zinc-700"></div>
                        <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-zinc-700"></div>
                        <div className="absolute bottom-0 left-0 w-6 h-6 border-b border-l border-zinc-700"></div>
                        <div className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-zinc-700"></div>
                      </div>

                      <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500 z-10 bg-zinc-950/60 px-2 py-1 rounded">
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span> 
                          {isStartingWebcam ? 'LAUNCHING WEBCAM...' : 'STANDBY'}
                        </span>
                        <span>PAGE {activePageIndex + 1} OF {pages.length}</span>
                      </div>

                      <div className="text-center px-4 z-10">
                        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 text-yellow-500">
                          <Camera className="h-5 w-5" />
                        </div>
                        <h4 className="font-heading font-extrabold text-xs text-zinc-200">Scan Page {activePageIndex + 1}</h4>
                        <p className="text-[10px] text-zinc-400 mt-1 max-w-[200px] mx-auto leading-normal">
                          Snapshot or upload a clear, flat photo of your signed document.
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 z-10 w-full mt-auto">
                        <label className="w-full bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-extrabold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition active:scale-98">
                          <Camera className="h-4 w-4" /> Snap with Camera
                          <input type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" />
                        </label>
                        <label className="w-full bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-200 font-bold text-xs py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition text-center">
                          <Upload className="h-3.5 w-3.5" /> Upload from Gallery
                          <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                        </label>
                        <button
                          onClick={handleLoadDemoDocument}
                          className="w-full bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 text-zinc-400 font-mono text-[9px] py-1 px-2 rounded-md hover:text-zinc-200 transition"
                        >
                          💡 Load Demo Document Template
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* 2 & 3. DUAL-MODE WORKSPACE (Crop/Align Canvas is always mounted, Cropped image is layered if present) */
                <div className="relative w-full max-w-[340px] aspect-[4/5] flex items-center justify-center">
                  
                  {/* CROP / ALIGN QUADRILATERAL DESIGNER */}
                  <div
                    ref={containerRef}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    className={`relative select-none w-full h-full bg-zinc-950 rounded-xl shadow-2xl cursor-crosshair overflow-hidden border border-yellow-500/20 ${
                      activePage.croppedImage ? 'hidden' : 'block'
                    }`}
                  >
                    <canvas ref={canvasRef} className="rounded-xl w-full h-full block" />

                    <svg viewBox="0 0 400 480" className="absolute inset-0 w-full h-full pointer-events-none">
                      <polygon
                        points={`${activePage.corners[0].x},${activePage.corners[0].y} ${activePage.corners[1].x},${activePage.corners[1].y} ${activePage.corners[2].x},${activePage.corners[2].y} ${activePage.corners[3].x},${activePage.corners[3].y}`}
                        className="fill-yellow-500/10 stroke-yellow-500 stroke-[2.5px]"
                        strokeDasharray="4 2"
                      />
                    </svg>

                    {/* Corners handle knobs */}
                    {activePage.corners.map((corner, idx) => (
                      <div
                        key={idx}
                        onPointerDown={(e) => handlePointerDown(e, idx)}
                        style={{
                          left: `${(corner.x / 400) * 100}%`,
                          top: `${(corner.y / 480) * 100}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        className={`absolute w-6 h-6 rounded-full border-2 bg-zinc-950 flex items-center justify-center cursor-move shadow-xl transition-transform hover:scale-125 select-none ${
                          activeCornerIdx === idx ? 'border-yellow-400 scale-125 ring-4 ring-yellow-400/20' : 'border-zinc-300'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${activeCornerIdx === idx ? 'bg-yellow-400' : 'bg-zinc-300'}`}></div>
                        <span className="absolute -top-5 text-[8px] font-mono font-bold bg-zinc-950 px-1 rounded border border-zinc-800 text-zinc-300 select-none pointer-events-none whitespace-nowrap">
                          {idx === 0 ? 'TL' : idx === 1 ? 'TR' : idx === 2 ? 'BR' : 'BL'}
                        </span>
                      </div>
                    ))}
                    
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 bg-zinc-950/95 rounded border border-zinc-800 px-3 py-1.5 flex justify-between items-center text-[9px] text-zinc-300 font-mono">
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
                        DRAG CIRCLES TO DOC CORNERS
                      </span>
                    </div>
                  </div>

                  {/* CROPPED PREVIEW OUTLET */}
                  {activePage.croppedImage && (
                    <div className="absolute inset-0 w-full h-full bg-white rounded-xl border border-zinc-800 shadow-2xl overflow-hidden animate-[fadeIn_0.25s] flex items-center justify-center p-1.5">
                      <img src={activePage.croppedImage} alt="" className="w-full h-full object-contain rounded-lg bg-zinc-900" />
                      
                      {/* Stamp overlay indicator */}
                      <div className="absolute top-4 right-4 bg-zinc-900/90 border border-zinc-800 rounded px-2 py-1 text-[8px] font-mono text-emerald-400 font-bold tracking-wider flex items-center gap-1">
                        <Check className="h-2.5 w-2.5" /> CONFIRMED CROP
                      </div>
                    </div>
                  )}

                </div>
              )
            ) : (
              <div className="text-zinc-500 text-xs text-center font-mono py-12">
                No Page Selected
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: CONFIG & FILTERS & WORKFLOW CONTROLS (4 Columns) */}
          <div className="lg:col-span-4 p-4 flex flex-col justify-between overflow-y-auto max-h-[400px] lg:max-h-none border-t lg:border-t-0 lg:border-l border-zinc-800 bg-zinc-900/40 shrink-0">
            <div className="space-y-4">
              
              {/* IMAGE QUALITY DETECTOR REPORT CARD */}
              {activePage && activePage.sourceImage && (
                <div className="bg-zinc-950/80 rounded-xl p-3 border border-zinc-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-bold">IMAGE QUALITY ANALYSIS</span>
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      activePage.qualityStatus === 'excellent' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/50' :
                      activePage.qualityStatus === 'good' ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-900/30' :
                      activePage.qualityStatus === 'blurry' ? 'bg-amber-950 text-amber-400 border border-amber-900/50 animate-pulse' :
                      'bg-red-950 text-red-400 border border-red-900/50'
                    }`}>
                      {activePage.qualityStatus.toUpperCase()}
                    </span>
                  </div>

                  {/* Metric Meter */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-zinc-400">Legibility Sharpness Score</span>
                      <span className={`font-mono font-bold ${
                        activePage.qualityScore >= 80 ? 'text-emerald-400' :
                        activePage.qualityScore >= 60 ? 'text-amber-400' : 'text-red-400'
                      }`}>{activePage.qualityScore} / 100</span>
                    </div>
                    
                    <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${activePage.qualityScore}%` }} 
                        className={`h-full rounded-full transition-all duration-500 ${
                          activePage.qualityScore >= 80 ? 'bg-emerald-500' :
                          activePage.qualityScore >= 60 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Fuzzy Warning Banner if Blurry or Dirty */}
                  {(activePage.qualityStatus === 'blurry' || activePage.qualityStatus === 'dirty') ? (
                    <div className="bg-red-950/40 border border-red-900/40 rounded-lg p-2.5 flex gap-2 text-[10.5px] leading-relaxed text-red-300 animate-[bounce_0.6s_1]">
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-extrabold block">Fuzzy Scan Warning!</strong>
                        {activePage.qualityReason || 'Image details are too blurry or have low contrast. Please steady your camera and retake.'}
                        <button 
                          onClick={() => {
                            // Reset current page source
                            setPages(prev => prev.map((p, idx) => idx === activePageIndex ? { ...p, sourceImage: '', croppedImage: null } : p));
                            setIsCameraActive(true);
                          }}
                          className="mt-1.5 text-[9.5px] bg-red-900 hover:bg-red-850 text-white font-extrabold px-2 py-0.5 rounded cursor-pointer transition block text-center"
                        >
                          🔄 Re-take Clear Photo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[9px] font-mono text-zinc-500 leading-normal flex gap-1 items-start">
                      <Info className="h-3 w-3 text-zinc-500 shrink-0 mt-0.5" />
                      <span>Perfect lighting and text outline detected. Suitable for digital invoicing.</span>
                    </div>
                  )}
                </div>
              )}

              {/* ENHANCEMENT FILTERS */}
              {activePage && activePage.sourceImage && (
                <div className="space-y-2">
                  <h4 className="font-heading font-bold text-xs text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-yellow-500" /> Page Enhancement Filters
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'original', label: 'Color Original', desc: 'No filter applied' },
                      { id: 'greyscale', label: 'Greyscale', desc: 'Desaturated tones' },
                      { id: 'scan_boost', label: 'Scanner Clean', desc: 'Deep black text' },
                      { id: 'high_contrast', label: 'High Contrast', desc: 'Extreme binarized' },
                    ].map((f) => {
                      const isSelected = activePage.filter === f.id;
                      return (
                        <button
                          key={f.id}
                          onClick={() => {
                            // Update filter in state and re-straighten
                            handleStraightenAndCrop(f.id as any);
                          }}
                          className={`flex flex-col items-start p-2 rounded-lg border text-left transition select-none ${
                            isSelected
                              ? 'bg-yellow-500/10 border-yellow-500 text-yellow-200'
                              : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                          }`}
                        >
                          <span className="text-[11px] font-bold flex items-center gap-1">
                            {isSelected && <Check className="h-3 w-3 text-yellow-500" />}
                            {f.label}
                          </span>
                          <span className="text-[9px] text-zinc-500 mt-0.5">{f.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CROP CONFIG PRESETS */}
              {activePage && activePage.sourceImage && !activePage.croppedImage && (
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 space-y-1.5">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase font-bold block">Crop Preset Alignments</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      {
                        label: 'Letter Paper',
                        corners: [
                          { x: 30, y: 30 },
                          { x: 370, y: 30 },
                          { x: 370, y: 450 },
                          { x: 30, y: 450 }
                        ]
                      },
                      {
                        label: 'Receipt Slip',
                        corners: [
                          { x: 90, y: 15 },
                          { x: 310, y: 15 },
                          { x: 310, y: 465 },
                          { x: 90, y: 465 }
                        ]
                      },
                      {
                        label: 'Full Frame',
                        corners: [
                          { x: 5, y: 5 },
                          { x: 395, y: 5 },
                          { x: 395, y: 475 },
                          { x: 5, y: 475 }
                        ]
                      }
                    ].map((opt, oIdx) => (
                      <button
                        key={oIdx}
                        type="button"
                        onClick={() => {
                          setPages(prev => prev.map((p, idx) => idx === activePageIndex ? {
                            ...p,
                            corners: opt.corners as [Point, Point, Point, Point]
                          } : p));
                        }}
                        className="p-1 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-bold hover:bg-zinc-800 transition"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* ACTION FOOTER */}
            <div className="pt-4 border-t border-zinc-800 space-y-2 shrink-0">
              {activePage && activePage.sourceImage && !activePage.croppedImage && (
                <button
                  onClick={() => handleStraightenAndCrop()}
                  className="w-full bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-extrabold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-lg transition active:scale-98"
                >
                  <RotateCcw className="h-4 w-4 shrink-0" /> Straighten & Save Page {activePageIndex + 1}
                </button>
              )}

              {activePage && activePage.croppedImage && (
                <button
                  onClick={() => {
                    setPages(prev => prev.map((p, idx) => idx === activePageIndex ? { ...p, croppedImage: null } : p));
                  }}
                  className="w-full bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 font-bold text-xs py-2 px-4 rounded-xl flex items-center justify-center gap-1.5 transition"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Re-adjust Crop / Corners
                </button>
              )}

              {/* FINAL SAVE / UPLOAD ALL BUTTON */}
              <div className="pt-2 border-t border-zinc-800/60">
                <button
                  disabled={isCompiling || pages.filter(p => p.croppedImage).length === 0}
                  onClick={handleCompileAndSaveAll}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-extrabold text-xs sm:text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-emerald-500/10 active:scale-98 transition"
                >
                  {isCompiling ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Compiling Scan Pages...
                    </>
                  ) : (
                    <>
                      <FileCheck className="h-4 w-4 shrink-0" />
                      Save & Upload POD Documents ({pages.filter(p => p.croppedImage).length}p)
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
