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

// `wa.me` correctly hands off to the WhatsApp app on mobile (the OS
// intercepts the link), but on a desktop browser it always opens WhatsApp
// Web — even when the WhatsApp Desktop app is installed. The desktop app
// instead registers the `whatsapp://` protocol, so route there when the
// caller knows this isn't a phone. Defaults to the wa.me/mobile form so
// existing callers that don't pass `isMobile` keep their old behaviour.
export function generateWhatsAppLink(phone: string, text: string, isMobile: boolean = true): string {
  // Strip non-numeric characters from phone
  const cleanPhone = phone.replace(/\D/g, '');
  const encodedText = encodeURIComponent(text);

  return isMobile
    ? `https://wa.me/${cleanPhone}?text=${encodedText}`
    : `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`;
}

export function generateEmailLink(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
