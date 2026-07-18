export async function shareFileOrText(
  file: File | null,
  text: string,
  title: string = 'Vyapar Sarthi Document'
): Promise<boolean> {
  try {
    if (navigator.share) {
      const shareData: ShareData = {
        title,
        text,
      };
      
      // Attempt to share with file if provided and supported
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        shareData.files = [file];
      }
      
      await navigator.share(shareData);
      return true;
    }
  } catch (err: any) {
    // If the user cancelled the share, don't consider it an error to fallback from
    if (err.name === 'AbortError') {
      return false;
    }
    console.error('Error sharing natively:', err);
  }

  // Fallback if native share fails or is unavailable
  return false;
}

export function generateWhatsAppLink(phone: string, text: string): string {
  // Strip non-numeric characters from phone
  const cleanPhone = phone.replace(/\D/g, '');
  const encodedText = encodeURIComponent(text);
  
  // Use wa.me for general web/mobile compatibility
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

export function generateEmailLink(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
