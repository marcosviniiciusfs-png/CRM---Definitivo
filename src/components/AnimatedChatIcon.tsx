import chatGif from "@/assets/chat.gif";

const AnimatedChatIcon = () => {
  return (
    <div className="w-16 h-16 flex items-center justify-center">
      <img 
        src={chatGif} 
        alt="Chat animado" 
        className="w-full h-full object-contain"
      />
    </div>
  );
};

export default AnimatedChatIcon;
