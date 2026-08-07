// Utility functions for TruckDispatch Pro

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatWeight(lbs: number): string {
  return `${new Intl.NumberFormat('en-US').format(lbs)} lbs`;
}

export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// Custom bilinear warp for perspective correction
// Warps an arbitrary quadrilateral region from the source image into a flat destination image
export interface Point {
  x: number;
  y: number;
}

export function warpPerspective(
  sourceCtx: CanvasRenderingContext2D,
  sourceWidth: number,
  sourceHeight: number,
  corners: [Point, Point, Point, Point], // TL, TR, BR, BL in canvas coordinates
  destWidth: number,
  destHeight: number
): ImageData {
  // Create an output image buffer
  const destData = new ImageData(destWidth, destHeight);
  const sourceData = sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight);
  const srcPixels = sourceData.data;
  const destPixels = destData.data;

  const [p0, p1, p2, p3] = corners;

  // For every pixel in the destination image
  for (let dy = 0; dy < destHeight; dy++) {
    const v = dy / (destHeight - 1 || 1); // vertical fraction [0..1]
    for (let dx = 0; dx < destWidth; dx++) {
      const u = dx / (destWidth - 1 || 1); // horizontal fraction [0..1]

      // Bilinear interpolation to find matching source pixel coordinates
      const topX = p0.x + u * (p1.x - p0.x);
      const topY = p0.y + u * (p1.y - p0.y);
      const botX = p3.x + u * (p2.x - p3.x);
      const botY = p3.y + u * (p2.y - p3.y);

      const sx = Math.floor(topX + v * (botX - topX));
      const sy = Math.floor(topY + v * (botY - topY));

      // Ensure coordinate is inside source boundary
      if (sx >= 0 && sx < sourceWidth && sy >= 0 && sy < sourceHeight) {
        const srcIdx = (sy * sourceWidth + sx) * 4;
        const destIdx = (dy * destWidth + dx) * 4;

        destPixels[destIdx] = srcPixels[srcIdx];         // R
        destPixels[destIdx + 1] = srcPixels[srcIdx + 1]; // G
        destPixels[destIdx + 2] = srcPixels[srcIdx + 2]; // B
        destPixels[destIdx + 3] = srcPixels[srcIdx + 3]; // A
      } else {
        const destIdx = (dy * destWidth + dx) * 4;
        destPixels[destIdx] = 255;
        destPixels[destIdx + 1] = 255;
        destPixels[destIdx + 2] = 255;
        destPixels[destIdx + 3] = 255;
      }
    }
  }

  return destData;
}

// Document enhancement filter processing
export function applyDocumentFilter(
  pixels: Uint8ClampedArray,
  filterType: 'original' | 'greyscale' | 'high_contrast' | 'scan_boost',
  width?: number,
  height?: number
) {
  // Apply a professional 3x3 sharpening convolution filter to remove blurriness and clear up edges
  if (width && height && width > 2 && height > 2) {
    const temp = new Uint8ClampedArray(pixels);
    // Sharpening kernel to clear up lines, signatures, and stamps
    const kernel = [
      [ 0, -1,  0],
      [-1,  5, -1],
      [ 0, -1,  0]
    ];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4;
            const weight = kernel[ky + 1][kx + 1];
            rSum += temp[idx] * weight;
            gSum += temp[idx + 1] * weight;
            bSum += temp[idx + 2] * weight;
          }
        }
        
        const idx = (y * width + x) * 4;
        pixels[idx] = Math.min(255, Math.max(0, rSum));
        pixels[idx + 1] = Math.min(255, Math.max(0, gSum));
        pixels[idx + 2] = Math.min(255, Math.max(0, bSum));
      }
    }
  }

  // Now apply binarization or contrast stretching
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    if (filterType === 'greyscale') {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      pixels[i] = gray;
      pixels[i + 1] = gray;
      pixels[i + 2] = gray;
    } else if (filterType === 'high_contrast') {
      // Binarized solid black & white
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const thres = gray > 125 ? 255 : 0;
      pixels[i] = thres;
      pixels[i + 1] = thres;
      pixels[i + 2] = thres;
    } else if (filterType === 'scan_boost') {
      // Enhanced scanning: boost white background and deepen dark strokes while retaining color stamps/signatures if needed
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      let val = gray;
      if (gray > 140) {
        val = 255;
      } else if (gray < 70) {
        val = 0;
      } else {
        // Stretch midtones
        val = ((gray - 70) / 70) * 255;
      }
      pixels[i] = Math.min(255, Math.max(0, val));
      pixels[i + 1] = Math.min(255, Math.max(0, val));
      pixels[i + 2] = Math.min(255, Math.max(0, val));
    }
  }
}

export interface PmGuardResult {
  status: 'not_configured' | 'current' | 'approaching_due' | 'due' | 'overdue' | 'service_in_progress';
  milesRemaining: number;
  milesOverdue: number;
  isOverdueOrDue: boolean;
  isBlocked: boolean;
  policy: 'warning_only' | 'block_dispatch' | 'approval_required' | 'hard_block' | 'none';
  reason: string;
}

export function checkTruckPmGuard(truck: any): PmGuardResult {
  if (!truck) {
    return {
      status: 'not_configured',
      milesRemaining: 0,
      milesOverdue: 0,
      isOverdueOrDue: false,
      isBlocked: false,
      policy: 'warning_only',
      reason: ''
    };
  }

  const currentOdo = Number(truck.currentOdometerDecimal || 0);
  const nextDue = Number(truck.nextPmDueOdometerDecimal || 0);
  const warningMiles = Number(truck.pmWarningMilesDecimal || 1000);
  const overdueTolerance = Number(truck.pmOverdueToleranceMilesDecimal || 500);
  const rawPolicy = String(truck.pmDispatchPolicy || 'warning_only').toLowerCase();
  
  const policy: 'warning_only' | 'block_dispatch' | 'approval_required' | 'hard_block' | 'none' = 
    (rawPolicy === 'block_dispatch' || rawPolicy === 'hard_block') ? 'block_dispatch' :
    rawPolicy === 'approval_required' ? 'approval_required' :
    rawPolicy === 'none' ? 'none' : 'warning_only';

  let status: 'not_configured' | 'current' | 'approaching_due' | 'due' | 'overdue' | 'service_in_progress' = 'not_configured';
  let milesRemaining = 0;

  if (nextDue > 0) {
    milesRemaining = nextDue - currentOdo;
    if (milesRemaining < -overdueTolerance) {
      status = 'overdue';
    } else if (milesRemaining <= 0) {
      status = 'due';
    } else if (milesRemaining <= warningMiles) {
      status = 'approaching_due';
    } else {
      status = 'current';
    }
  } else if (truck.pmStatus) {
    status = truck.pmStatus;
  }

  const isOverdueOrDue = status === 'overdue' || status === 'due';
  const milesOverdue = milesRemaining < 0 ? Math.abs(milesRemaining) : 0;

  // Dispatch is blocked if explicitly set dispatchBlocked OR if PM is overdue/due under a blocking policy
  const policyStr = String(policy);
  const isHardBlock = policyStr === 'block_dispatch' || policyStr === 'hard_block';
  const isBlocked = Boolean(truck.dispatchBlocked || (isOverdueOrDue && isHardBlock));

  let reason = '';
  if (truck.dispatchBlocked) {
    reason = truck.dispatchBlockedReason || `Power Unit #${truck.truckNumber || 'N/A'} is marked as DISPATCH BLOCKED in Fleet Operations.`;
  } else if (isOverdueOrDue) {
    reason = `Power Unit #${truck.truckNumber || 'N/A'} is PM ${status.toUpperCase()} (${milesOverdue.toLocaleString()} miles overdue).`;
  }

  return {
    status,
    milesRemaining,
    milesOverdue,
    isOverdueOrDue,
    isBlocked,
    policy,
    reason
  };
}
