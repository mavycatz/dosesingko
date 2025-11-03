import sys
import random

reply_styles = {
    "general": [
        "Thank you so much for visiting us! We are sorry if your experience wasn't perfect and truly appreciate your feedback - it helps us improve.",
        "We really appreciate you visiting us! We apologize if you faced any issues, and we are committed to making your next visit a great one."
    ],
    "complaint": [
        "We are grateful you stopped by! We apologize if anything fell short during your visit and hope to make your next experience even better.",
        "Thank you for choosing to visit us. We are sorry for any inconvenience you may have experienced and value your input to help us serve you better."
    ],
    "casual": [
        "Thanks for coming by! We are sorry if things didn't go as smoothly as you expected and hope to see you again soon."
    ]
}

def generate_reply(message):
    message_lower = message.lower()

    if any(word in message_lower for word in ["problem", "issue", "wrong", "complaint", "delay"]):
        category = "complaint"
    elif any(word in message_lower for word in ["hi", "hello", "hey", "thanks", "thank"]):
        category = "casual"
    else:
        category = "general"

    reply = random.choice(reply_styles[category])
    return reply

if __name__ == "__main__":
    message = " ".join(sys.argv[1:])
    reply = generate_reply(message)
    print(reply)
