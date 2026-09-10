// Ported from picosvg arc_to_cubic.py (Apache-2.0, Copyright 2020 Google LLC),
// itself adapted from FontTools svgLib and Blink's SVGPathNormalizer.

import type { Pt } from './geometry.js';
import { pt, ptAdd, ptEquals, ptMul, ptSub } from './geometry.js';
import { Affine2D } from './transform.js';

const TWO_PI = 2 * Math.PI;
const PI_OVER_TWO = 0.5 * Math.PI;

type EllipticalArc = {
  startPoint: Pt;
  rx: number;
  ry: number;
  rotation: number;
  large: number;
  sweep: number;
  endPoint: Pt;
};

function isStraightLine(arc: EllipticalArc): boolean {
  // If rx = 0 or ry = 0 then this arc is treated as a straight line segment (a
  // "lineto") joining the endpoints.
  // http://www.w3.org/TR/SVG/implnote.html#ArcOutOfRangeParameters
  const rx = Math.abs(arc.rx);
  const ry = Math.abs(arc.ry);
  return !(rx && ry);
}

function isZeroLength(arc: EllipticalArc): boolean {
  return ptEquals(arc.endPoint, arc.startPoint);
}

// http://www.w3.org/TR/SVG/implnote.html#ArcCorrectionOutOfRangeRadii
function correctOutOfRangeRadii(arc: EllipticalArc): EllipticalArc {
  if (isStraightLine(arc) || isZeroLength(arc)) {
    return arc;
  }

  const midPointDistance = ptMul(ptSub(arc.startPoint, arc.endPoint), 0.5);

  const angle = (arc.rotation * Math.PI) / 180;
  const pointTransform = Affine2D.identity().rotate(-angle);

  const transformedMidPoint = pointTransform.mapVector(midPointDistance);
  let rx = arc.rx;
  let ry = arc.ry;
  const squareRx = rx * rx;
  const squareRy = ry * ry;
  const squareX = transformedMidPoint.x * transformedMidPoint.x;
  const squareY = transformedMidPoint.y * transformedMidPoint.y;

  const radiiScale = squareX / squareRx + squareY / squareRy;
  if (radiiScale > 1) {
    rx *= Math.sqrt(radiiScale);
    ry *= Math.sqrt(radiiScale);
    return { ...arc, rx, ry };
  }

  return arc;
}

// https://www.w3.org/TR/SVG/implnote.html#ArcConversionEndpointToCenter
function endToCenterParametrization(arc: EllipticalArc): {
  theta1: number;
  thetaArc: number;
  centerPoint: Pt;
} {
  const angle = (arc.rotation * Math.PI) / 180;
  const pointTransform = Affine2D.identity()
    .scale(1 / arc.rx, 1 / arc.ry)
    .rotate(-angle);

  const point1 = pointTransform.mapPoint(arc.startPoint);
  const point2 = pointTransform.mapPoint(arc.endPoint);
  let delta = ptSub(point2, point1);

  const d = delta.x * delta.x + delta.y * delta.y;
  const scaleFactorSquared = Math.max(1 / d - 0.25, 0.0);

  let scaleFactor = Math.sqrt(scaleFactorSquared);
  if (arc.sweep === arc.large) {
    scaleFactor = -scaleFactor;
  }

  delta = ptMul(delta, scaleFactor);
  let centerPoint = ptAdd(
    ptAdd(point1, ptMul(ptSub(point2, point1), 0.5)),
    pt(-delta.y, delta.x)
  );
  const v1 = ptSub(point1, centerPoint);
  const v2 = ptSub(point2, centerPoint);

  const theta1 = Math.atan2(v1.y, v1.x);
  const theta2 = Math.atan2(v2.y, v2.x);

  let thetaArc = theta2 - theta1;
  if (thetaArc < 0 && arc.sweep) {
    thetaArc += TWO_PI;
  } else if (thetaArc > 0 && !arc.sweep) {
    thetaArc -= TWO_PI;
  }

  centerPoint = pointTransform.inverse().mapPoint(centerPoint);

  return { theta1, thetaArc, centerPoint };
}

function* ellipticalArcToCubic(
  arc: EllipticalArc
): Generator<[Pt, Pt, Pt], void, void> {
  arc = correctOutOfRangeRadii(arc);
  const arcParams = endToCenterParametrization(arc);

  const pointTransform = Affine2D.identity()
    .translate(arcParams.centerPoint.x, arcParams.centerPoint.y)
    .rotate((arc.rotation * Math.PI) / 180)
    .scale(arc.rx, arc.ry);

  // Some results of atan2 on some platform implementations are not exact
  // enough. So that we get more cubic curves than expected here. Adding 0.001f
  // reduces the count of segments to the correct count.
  const numSegments = Math.ceil(
    Math.abs(arcParams.thetaArc / (PI_OVER_TWO + 0.001))
  );
  for (let i = 0; i < numSegments; i++) {
    const startTheta =
      arcParams.theta1 + (i * arcParams.thetaArc) / numSegments;
    const endTheta =
      arcParams.theta1 + ((i + 1) * arcParams.thetaArc) / numSegments;

    const t = (4 / 3) * Math.tan(0.25 * (endTheta - startTheta));
    if (!Number.isFinite(t)) {
      return;
    }

    const sinStartTheta = Math.sin(startTheta);
    const cosStartTheta = Math.cos(startTheta);
    const sinEndTheta = Math.sin(endTheta);
    const cosEndTheta = Math.cos(endTheta);

    let point1 = pt(
      cosStartTheta - t * sinStartTheta,
      sinStartTheta + t * cosStartTheta
    );
    let endPoint = pt(cosEndTheta, sinEndTheta);
    let point2 = ptAdd(endPoint, pt(t * sinEndTheta, -t * cosEndTheta));

    point1 = pointTransform.mapPoint(point1);
    point2 = pointTransform.mapPoint(point2);

    // by definition, the last bezier's end point == the arc end point
    // by directly taking the end point we avoid floating point imprecision
    if (i === numSegments - 1) {
      endPoint = arc.endPoint;
    } else {
      endPoint = pointTransform.mapPoint(endPoint);
    }

    yield [point1, point2, endPoint];
  }
}

// Convert arc to cubic(s).
//
// Yields [p1, p2, endPoint] per cubic bezier (two off-curve, one on-curve).
// If either rx or ry is 0 the arc is a straight line joining the end points
// and a [null, null, endPoint] tuple is yielded.
// Yields nothing if the arc has zero length.
export function* arcToCubic(
  startPoint: Pt,
  rx: number,
  ry: number,
  rotation: number,
  large: number,
  sweep: number,
  endPoint: Pt
): Generator<[Pt | null, Pt | null, Pt], void, void> {
  const arc: EllipticalArc = {
    startPoint,
    rx,
    ry,
    rotation,
    large,
    sweep,
    endPoint,
  };
  if (isZeroLength(arc)) {
    return;
  } else if (isStraightLine(arc)) {
    yield [null, null, arc.endPoint];
  } else {
    yield* ellipticalArcToCubic(arc);
  }
}
