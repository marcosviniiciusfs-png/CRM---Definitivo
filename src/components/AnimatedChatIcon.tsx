import chatAnimation from "@/assets/chat-2.json";

const AnimatedChatIcon = () => {
  return (
    <div className="w-16 h-16 flex items-center justify-center">
      <dotlottie-wc 
        src={JSON.stringify(chatAnimation)}
        autoplay
        loop
      />
    </div>
  );
};

export default AnimatedChatIcon;
