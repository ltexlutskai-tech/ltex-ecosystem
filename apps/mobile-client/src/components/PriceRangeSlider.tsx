import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  type LayoutChangeEvent,
} from "react-native";

interface Props {
  min: number;
  max: number;
  values: [number, number];
  onChange: (values: [number, number]) => void;
  step?: number;
}

const THUMB_SIZE = 22;
const TRACK_HEIGHT = 4;

/**
 * Pure-RN dual-handle range slider. Uses two PanResponders that map the gesture
 * `dx` onto the track width. We avoid `@react-native-community/slider` because
 * (a) it ships only single-handle, and (b) the maintained Expo replacement is
 * deprecated in SDK 52.
 */
export function PriceRangeSlider({
  min,
  max,
  values,
  onChange,
  step = 1,
}: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const startLoRef = useRef(values[0]);
  const startHiRef = useRef(values[1]);
  const valuesRef = useRef<[number, number]>(values);
  valuesRef.current = values;

  const span = max - min || 1;
  const usableWidth = Math.max(0, trackWidth - THUMB_SIZE);

  const valueToPx = (v: number) => ((v - min) / span) * usableWidth;
  const pxToValue = (px: number) => {
    const raw = (px / usableWidth) * span + min;
    const stepped = Math.round(raw / step) * step;
    return Math.max(min, Math.min(max, stepped));
  };

  const onLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const minResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startLoRef.current = valuesRef.current[0];
      },
      onPanResponderMove: (_, gesture) => {
        const startPx = valueToPx(startLoRef.current);
        const nextPx = startPx + gesture.dx;
        const nextLo = Math.min(pxToValue(nextPx), valuesRef.current[1]);
        if (nextLo !== valuesRef.current[0]) {
          onChange([nextLo, valuesRef.current[1]]);
        }
      },
    }),
  ).current;

  const maxResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startHiRef.current = valuesRef.current[1];
      },
      onPanResponderMove: (_, gesture) => {
        const startPx = valueToPx(startHiRef.current);
        const nextPx = startPx + gesture.dx;
        const nextHi = Math.max(pxToValue(nextPx), valuesRef.current[0]);
        if (nextHi !== valuesRef.current[1]) {
          onChange([valuesRef.current[0], nextHi]);
        }
      },
    }),
  ).current;

  const leftPx = trackWidth > 0 ? valueToPx(values[0]) : 0;
  const rightPx = trackWidth > 0 ? valueToPx(values[1]) : 0;

  return (
    <View>
      <View style={styles.labels}>
        <Text style={styles.labelText}>{values[0]} €</Text>
        <Text style={styles.labelText}>{values[1]} €</Text>
      </View>
      <View style={styles.trackContainer} onLayout={onLayout}>
        <View style={styles.trackBg} />
        <View
          style={[
            styles.trackActive,
            {
              left: leftPx + THUMB_SIZE / 2,
              width: Math.max(0, rightPx - leftPx),
            },
          ]}
        />
        <View
          style={[styles.thumb, { left: leftPx }]}
          {...minResponder.panHandlers}
        />
        <View
          style={[styles.thumb, { left: rightPx }]}
          {...maxResponder.panHandlers}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  labelText: {
    fontSize: 12,
    color: "#4b5563",
    fontWeight: "500",
  },
  trackContainer: {
    height: THUMB_SIZE,
    justifyContent: "center",
  },
  trackBg: {
    position: "absolute",
    left: THUMB_SIZE / 2,
    right: THUMB_SIZE / 2,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: "#e5e7eb",
  },
  trackActive: {
    position: "absolute",
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: "#16a34a",
  },
  thumb: {
    position: "absolute",
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: "#16a34a",
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});
