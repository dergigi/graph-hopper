'use client';

import React, { ReactElement } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { truncatePubkey } from '../lib/graph';

interface NoteCardProps {
  note: NDKEvent;
}

export const NoteCard: React.FC<NoteCardProps> = ({ note }) => {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Helper function to detect and process different types of content
  const formatContent = () => {
    let content = note.content;
    const processedElements: ReactElement[] = [];
    
    // Process image URLs
    const imageRegex = /(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp))/gi;
    const images = content.match(imageRegex) || [];
    
    // Process video URLs
    const videoRegex = /(https?:\/\/\S+\.(?:mp4|webm|ogg))/gi;
    const videos = content.match(videoRegex) || [];
    
    // Process YouTube URLs
    const youtubeRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11}))/g;
    let youtubeMatches: RegExpExecArray[] = [];
    let match: RegExpExecArray | null;
    
    while ((match = youtubeRegex.exec(content)) !== null) {
      youtubeMatches.push(match);
    }
    
    const youtubeUrls = youtubeMatches.map(match => match[0]);
    const youtubeIds = youtubeMatches.map(match => match[2]);
    
    // Process Nostr references
    const nprofileRegex = /(nostr:nprofile[a-zA-Z0-9]{1,400})/g;
    const nprofiles = content.match(nprofileRegex) || [];
    
    const neventRegex = /(nostr:nevent[a-zA-Z0-9]{1,400})/g;
    const nevents = content.match(neventRegex) || [];
    
    const npubRegex = /(npub[a-zA-Z0-9]{1,60})/g;
    const npubs = content.match(npubRegex) || [];
    
    // Process regular URLs (that aren't images/videos/youtube/nostr)
    const allSpecialUrls = [...images, ...videos, ...youtubeUrls, ...nprofiles, ...nevents, ...npubs];
    const urlRegex = /(https?:\/\/\S+)/g;
    let plainUrls: string[] = [];
    let urlMatch;
    
    while ((urlMatch = urlRegex.exec(content)) !== null) {
      const url = urlMatch[0];
      if (!allSpecialUrls.includes(url)) {
        plainUrls.push(url);
      }
    }
    
    // Create text with clickable links
    let remainingText = content;
    
    // Replace plain URLs with links
    plainUrls.forEach(url => {
      remainingText = remainingText.split(url).join(`[[PLAIN_URL_${plainUrls.indexOf(url)}]]`);
    });
    
    // Replace Nostr references with links
    npubs.forEach(npub => {
      try {
        const { type, data } = nip19.decode(npub);
        if (type === 'npub') {
          const shortId = truncatePubkey(data as string);
          remainingText = remainingText.split(npub).join(`[[NPUB_${npubs.indexOf(npub)}]]`);
        }
      } catch (e) {
        // If decode fails, leave as is
      }
    });
    
    // Split text by newlines
    const textParts = remainingText.split('\n');
    
    // Process each line of text
    const processedText = textParts.map((part, index) => {
      // Restore plain URLs as links
      plainUrls.forEach((url, urlIndex) => {
        part = part.split(`[[PLAIN_URL_${urlIndex}]]`).join(
          `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">${url}</a>`
        );
      });
      
      // Restore npubs as links
      npubs.forEach((npub, npubIndex) => {
        try {
          const { type, data } = nip19.decode(npub);
          if (type === 'npub') {
            const shortId = truncatePubkey(data as string);
            part = part.split(`[[NPUB_${npubIndex}]]`).join(
              `<a href="nostr:${npub}" class="text-purple-500 hover:underline font-medium">@${shortId}</a>`
            );
          }
        } catch (e) {
          // If decode fails, leave as is
        }
      });
      
      return (
        <p key={`text-${index}`} 
           className="mb-2" 
           dangerouslySetInnerHTML={{ __html: part }}
        />
      );
    });
    
    processedElements.push(...processedText);
    
    // Add images
    images.forEach((url, index) => {
      processedElements.push(
        <img 
          key={`img-${index}`}
          src={url} 
          alt="Embedded media" 
          className="w-full h-auto rounded-lg my-2 border border-gray-200 dark:border-gray-700 shadow-sm" 
          loading="lazy"
          onError={(e) => {
            // Replace broken images with a placeholder
            const img = e.target as HTMLImageElement;
            img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100%25' height='100%25' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14px' fill='%23999999'%3EImage unavailable%3C/text%3E%3C/svg%3E";
            img.className = img.className + " opacity-50";
          }}
        />
      );
    });
    
    // Add videos
    videos.forEach((url, index) => {
      processedElements.push(
        <video 
          key={`video-${index}`}
          src={url} 
          controls 
          className="w-full h-auto rounded-lg my-2 border border-gray-200 dark:border-gray-700 shadow-sm" 
        />
      );
    });
    
    // Add YouTube embeds
    youtubeIds.forEach((id, index) => {
      processedElements.push(
        <div key={`yt-${index}`} className="relative aspect-video w-full my-2 rounded-lg overflow-hidden">
          <iframe 
            src={`https://www.youtube.com/embed/${id}`}
            className="absolute top-0 left-0 w-full h-full"
            allowFullScreen
            title="YouTube video"
          />
        </div>
      );
    });
    
    // Add Nostr profile links
    nprofiles.forEach((nprofile, index) => {
      processedElements.push(
        <div key={`nprofile-${index}`} className="my-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <a href={nprofile} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 mr-1">
              <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
            </svg>
            View Nostr Profile
          </a>
        </div>
      );
    });
    
    // Add Nostr event links
    nevents.forEach((nevent, index) => {
      processedElements.push(
        <div key={`nevent-${index}`} className="my-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <a href={nevent} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 mr-1">
              <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97zM6.75 8.25a.75.75 0 01.75-.75h9a.75.75 0 010 1.5h-9a.75.75 0 01-.75-.75zm.75 2.25a.75.75 0 000 1.5H12a.75.75 0 000-1.5H7.5z" clipRule="evenodd" />
            </svg>
            View Nostr Note
          </a>
        </div>
      );
    });
    
    return processedElements;
  };

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
      <div className="prose dark:prose-invert prose-sm max-w-none">
        {formatContent()}
      </div>
      
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex justify-between items-center">
        <span>{formatDate(note.created_at || 0)}</span>
        <a 
          href={`nostr:note1${note.id}`} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 mr-1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
          View on Nostr
        </a>
      </div>
    </div>
  );
}; 