"""Shared ORM → DTO mappers."""
from app.deps import is_admin_user
from app.models import User
from app.schemas import UserProfile


def to_profile(user: User) -> UserProfile:
    return UserProfile(
        id=user.id,
        username=user.username,
        fullName=user.full_name,
        bio=user.bio,
        location=user.location,
        avatarUrl=user.avatar_url,
        sports=user.sports,
        entertainment=user.entertainment,
        email=user.email,
        emailVerified=bool(user.email_verified),
        isAdmin=is_admin_user(user),
    )
