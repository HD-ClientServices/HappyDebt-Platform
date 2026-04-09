"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
} from "lucide-react";

export interface CallAudioPlayerProps {
  recordingUrl: string;
  callId: string; // for PLG tracking
  duration?: number;
  onPlay?: () => void;
  className?: string;
}

const SPEEDS = [1, 1.25, 1.5, 2] as const;

export function CallAudioPlayer({
  recordingUrl,
  callId: _callId,
  duration: initialDuration,
  onPlay,
  className,
}: CallAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration ?? 0);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);

  const updateTime = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    setCurrentTime(el.currentTime);
    if (duration === 0 && el.duration) setDuration(el.duration);
  }, [duration]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTimeUpdate = () => updateTime();
    const onLoadedMetadata = () => setDuration(el.duration);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("loadedmetadata", onLoadedMetadata);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
      el.removeEventListener("ended", onEnded);
    };
  }, [updateTime]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = muted;
  }, [muted]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play();
      onPlay?.();
    }
    setPlaying(!playing);
  };

  const skip = (delta: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + delta));
    updateTime();
  };

  const setProgress = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const p = Number(e.target.value);
    el.currentTime = p;
    setCurrentTime(p);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg bg-zinc-800/80 border border-zinc-700 p-2",
        className
      )}
    >
      <audio ref={audioRef} src={recordingUrl} preload="metadata" />
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={togglePlay}
      >
        {playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 ml-0.5" />
        )}
      </Button>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-xs tabular-nums text-muted-foreground w-9">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={setProgress}
          className="flex-1 h-1.5 rounded-full appearance-none bg-zinc-700 accent-emerald-500"
        />
        <span className="text-xs tabular-nums text-muted-foreground w-9">
          {formatTime(duration)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setMuted((m) => !m)}
        >
          {muted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
